import type { Pool, PoolClient } from 'pg';
import type {
  CreateFileInteropJobInput,
  CreatePortfolioInput,
  ExtensionAuditLogDto,
  ExtensionManifestDto,
  FileInteropJobDto,
  PortfolioSummaryDto,
  RegisterExtensionManifestInput,
} from '@film-studio/contracts';

type Queryable = Pool | PoolClient;

interface PortfolioRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  film_count?: string | number;
  total_scenes?: string | number;
  total_budget_paise?: string | number;
}

interface FileInteropJobRow {
  id: string;
  film_id: string;
  job_type: 'import' | 'export' | 'migration';
  format: 'pdf' | 'docx' | 'txt' | 'fountain' | 'fdx' | 'csv' | 'xlsx';
  source_file_storage_key: string | null;
  result_file_storage_key: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  input_metadata: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  conformance_report: Record<string, unknown>;
  error_message: string | null;
  retained_source_on_failure: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface ExtensionManifestRow {
  id: string;
  organization_id: string;
  extension_identifier: string;
  version: string;
  name: string;
  description: string | null;
  sandbox_permissions: Array<
    | 'screenplay:read'
    | 'screenplay:write'
    | 'production:read'
    | 'production:write'
    | 'export:read'
    | 'network:restricted'
  >;
  allowed_endpoints: string[];
  is_verified: boolean;
  status: 'active' | 'disabled' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

interface ExtensionAuditLogRow {
  id: string;
  extension_id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  target_resource: string;
  sandbox_boundary_enforced: boolean;
  details: Record<string, unknown>;
  created_at: Date;
}

export class PostgresInteropRepository {
  constructor(private readonly pool: Queryable) {}

  async createPortfolio(input: CreatePortfolioInput): Promise<PortfolioSummaryDto> {
    const res = await this.pool.query<PortfolioRow>(
      `INSERT INTO organization_portfolios (
        organization_id, name, description, metadata
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, organization_id, name, description, metadata, created_at, updated_at`,
      [
        input.organizationId,
        input.name,
        input.description ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to create organization portfolio');
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      filmCount: 0,
      totalScenes: 0,
      totalEstimatedBudgetPaise: 0,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async assignFilmToPortfolio(portfolioId: string, filmId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO portfolio_film_assignments (portfolio_id, film_id)
       VALUES ($1, $2)
       ON CONFLICT (portfolio_id, film_id) DO NOTHING`,
      [portfolioId, filmId],
    );
  }

  async getPortfolioSummary(portfolioId: string, organizationId: string): Promise<PortfolioSummaryDto | null> {
    const res = await this.pool.query<PortfolioRow>(
      `SELECT
        p.id, p.organization_id, p.name, p.description, p.metadata, p.created_at, p.updated_at,
        COUNT(DISTINCT pfa.film_id) AS film_count,
        COALESCE(SUM(s.scene_count), 0) AS total_scenes,
        COALESCE(SUM(b.total_paise), 0) AS total_budget_paise
       FROM organization_portfolios p
       LEFT JOIN portfolio_film_assignments pfa ON pfa.portfolio_id = p.id
       LEFT JOIN (
         SELECT film_id, COUNT(*) AS scene_count
         FROM scenes
         WHERE deleted_at IS NULL
         GROUP BY film_id
       ) s ON s.film_id = pfa.film_id
       LEFT JOIN (
         SELECT film_id, SUM(estimated_total_cents) AS total_paise
         FROM budget_line_items
         GROUP BY film_id
       ) b ON b.film_id = pfa.film_id
       WHERE p.id = $1 AND p.organization_id = $2 AND p.deleted_at IS NULL
       GROUP BY p.id`,
      [portfolioId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      filmCount: Number(row.film_count ?? 0),
      totalScenes: Number(row.total_scenes ?? 0),
      totalEstimatedBudgetPaise: Number(row.total_budget_paise ?? 0),
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async createFileInteropJob(input: CreateFileInteropJobInput): Promise<FileInteropJobDto> {
    const res = await this.pool.query<FileInteropJobRow>(
      `INSERT INTO file_interop_jobs (
        film_id, job_type, format, source_file_storage_key, input_metadata,
        retained_source_on_failure, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.filmId,
        input.jobType,
        input.format,
        input.sourceFileStorageKey ?? null,
        JSON.stringify(input.inputMetadata ?? {}),
        input.retainedSourceOnFailure ?? true,
        input.createdBy,
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to create file interop job');
    }
    return this.mapFileInteropJob(row);
  }

  async updateFileInteropJobStatus(
    jobId: string,
    filmId: string,
    status: 'processing' | 'completed' | 'failed' | 'cancelled',
    result: {
      resultFileStorageKey?: string;
      outputSummary?: Record<string, unknown>;
      conformanceReport?: Record<string, unknown>;
      errorMessage?: string;
    },
  ): Promise<FileInteropJobDto | null> {
    const res = await this.pool.query<FileInteropJobRow>(
      `UPDATE file_interop_jobs
       SET status = $1,
           result_file_storage_key = COALESCE($2, result_file_storage_key),
           output_summary = COALESCE($3, output_summary),
           conformance_report = COALESCE($4, conformance_report),
           error_message = $5,
           updated_at = NOW()
       WHERE id = $6 AND film_id = $7
       RETURNING *`,
      [
        status,
        result.resultFileStorageKey ?? null,
        result.outputSummary ? JSON.stringify(result.outputSummary) : null,
        result.conformanceReport ? JSON.stringify(result.conformanceReport) : null,
        result.errorMessage ?? null,
        jobId,
        filmId,
      ],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.mapFileInteropJob(row);
  }

  async getFileInteropJob(jobId: string, filmId: string): Promise<FileInteropJobDto | null> {
    const res = await this.pool.query<FileInteropJobRow>(
      `SELECT * FROM file_interop_jobs WHERE id = $1 AND film_id = $2`,
      [jobId, filmId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.mapFileInteropJob(row);
  }

  async listFileInteropJobs(filmId: string): Promise<FileInteropJobDto[]> {
    const res = await this.pool.query<FileInteropJobRow>(
      `SELECT * FROM file_interop_jobs WHERE film_id = $1 ORDER BY created_at DESC`,
      [filmId],
    );
    return res.rows.map((row) => this.mapFileInteropJob(row));
  }

  async registerExtension(input: RegisterExtensionManifestInput): Promise<ExtensionManifestDto> {
    const res = await this.pool.query<ExtensionManifestRow>(
      `INSERT INTO extension_manifests (
        organization_id, extension_identifier, version, name, description,
        sandbox_permissions, allowed_endpoints, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (organization_id, extension_identifier, version)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        sandbox_permissions = EXCLUDED.sandbox_permissions,
        allowed_endpoints = EXCLUDED.allowed_endpoints,
        updated_at = NOW()
      RETURNING *`,
      [
        input.organizationId,
        input.extensionIdentifier,
        input.version,
        input.name,
        input.description ?? null,
        JSON.stringify(input.sandboxPermissions ?? []),
        JSON.stringify(input.allowedEndpoints ?? []),
        input.isVerified ?? false,
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to register extension manifest');
    }
    return this.mapExtensionManifest(row);
  }

  async getExtensionManifest(extensionId: string, organizationId: string): Promise<ExtensionManifestDto | null> {
    const res = await this.pool.query<ExtensionManifestRow>(
      `SELECT * FROM extension_manifests WHERE id = $1 AND organization_id = $2`,
      [extensionId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.mapExtensionManifest(row);
  }

  async logExtensionAudit(
    extensionId: string,
    organizationId: string,
    action: string,
    targetResource: string,
    sandboxBoundaryEnforced: boolean,
    details: Record<string, unknown> = {},
    actorUserId?: string,
  ): Promise<ExtensionAuditLogDto> {
    const res = await this.pool.query<ExtensionAuditLogRow>(
      `INSERT INTO extension_audit_logs (
        extension_id, organization_id, actor_user_id, action, target_resource,
        sandbox_boundary_enforced, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        extensionId,
        organizationId,
        actorUserId ?? null,
        action,
        targetResource,
        sandboxBoundaryEnforced,
        JSON.stringify(details),
      ],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to record extension audit log');
    }
    return {
      id: row.id,
      extensionId: row.extension_id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetResource: row.target_resource,
      sandboxBoundaryEnforced: row.sandbox_boundary_enforced,
      details: row.details,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapFileInteropJob(row: FileInteropJobRow): FileInteropJobDto {
    return {
      id: row.id,
      filmId: row.film_id,
      jobType: row.job_type,
      format: row.format,
      sourceFileStorageKey: row.source_file_storage_key,
      resultFileStorageKey: row.result_file_storage_key,
      status: row.status,
      inputMetadata: row.input_metadata,
      outputSummary: row.output_summary,
      conformanceReport: row.conformance_report,
      errorMessage: row.error_message,
      retainedSourceOnFailure: row.retained_source_on_failure,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapExtensionManifest(row: ExtensionManifestRow): ExtensionManifestDto {
    return {
      id: row.id,
      organizationId: row.organization_id,
      extensionIdentifier: row.extension_identifier,
      version: row.version,
      name: row.name,
      description: row.description,
      sandboxPermissions: row.sandbox_permissions,
      allowedEndpoints: row.allowed_endpoints,
      isVerified: row.is_verified,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
