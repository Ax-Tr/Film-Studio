import { describe, expect, it } from 'vitest';
import type { RequestUploadUrlDto } from '@film-studio/contracts';
import {
  asFilmId,
  asUserId,
  type FilmAccessSnapshot,
} from '@film-studio/domain';
import {
  AuditService,
  type AuditRepository,
} from '../src/modules/audit/audit.service.js';
import { PermissionService } from '../src/modules/authorization/permission.service.js';
import type { AuthorizationRepository } from '../src/modules/authorization/authorization.repository.js';
import { FilesJobsService } from '../src/modules/files-jobs/files-jobs.service.js';
import type { MutationContext } from '../src/modules/tenant/tenant.service.js';
import type {
  BackgroundJobRecord,
  FileRecord,
  PostgresFilesJobsRepository,
} from '../src/database/postgres-files-jobs.repository.js';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const sessionId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const filmId = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const fileId = '018f4ce4-f001-7000-8000-000000000001';
const jobId = '018f4ce4-f002-7000-8000-000000000001';

const context: MutationContext = {
  userId,
  sessionId,
  requestId: 'req-files-001',
};

class FakeFilesJobsRepository {
  files = new Map<string, FileRecord>();
  jobs = new Map<string, BackgroundJobRecord>();

  async createFile(
    _userId: string,
    fId: string,
    input: { fileName: string; mimeType: string; sizeBytes: number; sha256Hex: string },
  ): Promise<FileRecord> {
    const record: FileRecord = {
      id: fileId,
      filmId: fId,
      uploaderUserId: userId,
      storageKey: `films/${fId}/assets/${fileId}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256Hex: input.sha256Hex,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.files.set(fileId, record);
    return record;
  }

  async findFile(_userId: string, _fId: string, id: string): Promise<FileRecord | null> {
    return this.files.get(id) ?? null;
  }

  async updateFileStatus(
    _userId: string,
    _fId: string,
    id: string,
    status: FileRecord['status'],
    quarantineReason?: string,
  ): Promise<FileRecord> {
    const existing = this.files.get(id);
    if (!existing) throw new Error('File not found');
    const updated: FileRecord = {
      ...existing,
      status,
      ...(quarantineReason ? { quarantineReason } : {}),
    };
    this.files.set(id, updated);
    return updated;
  }

  async createJob(
    _userId: string,
    fId: string,
    input: {
      queueName: BackgroundJobRecord['queueName'];
      jobType: string;
      idempotencyKey?: string;
      payload: Record<string, unknown>;
      maxAttempts?: number;
    },
  ): Promise<BackgroundJobRecord> {
    const record: BackgroundJobRecord = {
      id: jobId,
      filmId: fId,
      creatorUserId: userId,
      queueName: input.queueName,
      jobType: input.jobType,
      status: 'queued',
      payload: input.payload,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    this.jobs.set(jobId, record);
    return record;
  }

  async findJob(_userId: string, _fId: string, id: string): Promise<BackgroundJobRecord | null> {
    return this.jobs.get(id) ?? null;
  }
}

function setup(options: { hasMembership: boolean; canEdit: boolean }) {
  const repository = new FakeFilesJobsRepository() as unknown as PostgresFilesJobsRepository;
  const recordedAudits: unknown[] = [];

  const authRepo: AuthorizationRepository = {
    loadFilmAccess: async (): Promise<FilmAccessSnapshot> => ({
      userId: asUserId(userId),
      filmId: asFilmId(filmId),
      membershipStatus: options.hasMembership ? 'active' : 'revoked',
      accountSuspended: false,
      sessionRevoked: false,
      grants: options.canEdit
        ? [
            { permission: 'film.documents.edit', effect: 'allow', source: 'role' },
            { permission: 'film.documents.read', effect: 'allow', source: 'role' },
          ]
        : [{ permission: 'film.documents.read', effect: 'allow', source: 'role' }],
    }),
  };

  const auditRepo: AuditRepository = {
    insert: async (event) => {
      recordedAudits.push(event);
    },
  };

  const permissions = new PermissionService(authRepo);
  const audit = new AuditService(auditRepo);
  const service = new FilesJobsService(repository, permissions, audit);

  return { service, repository: repository as unknown as FakeFilesJobsRepository, recordedAudits };
}

describe('FilesJobsService', () => {
  it('issues presigned upload URL for authorized user and allowed MIME type', async () => {
    const { service, recordedAudits } = setup({ hasMembership: true, canEdit: true });
    const response = await service.requestUploadUrl(context, filmId, {
      fileName: 'screenplay.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 5000000,
      sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    expect(response.uploadUrl).toContain('https://storage.storyforge.example/upload/');
    expect(response.uploadUrl).toContain('token=');
    expect(recordedAudits).toHaveLength(1);
  });

  it('rejects disallowed MIME type', async () => {
    const { service } = setup({ hasMembership: true, canEdit: true });
    await expect(
      service.requestUploadUrl(context, filmId, {
        fileName: 'malicious.exe',
        mimeType:
          'application/x-msdownload' as unknown as RequestUploadUrlDto['mimeType'],
        sizeBytes: 1000,
        sha256Hex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      }),
    ).rejects.toThrow('INVALID_MIME_TYPE');
  });

  it('generates download URL for ready file and blocks quarantined file', async () => {
    const { service } = setup({ hasMembership: true, canEdit: true });
    await service.requestUploadUrl(context, filmId, {
      fileName: 'script.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    // Mark ready
    await service.scanFile(context, filmId, fileId, { safe: true });
    const download = await service.getDownloadUrl(context, filmId, fileId);
    expect(download.downloadUrl).toContain('https://storage.storyforge.example/download/');

    // Mark quarantined
    await service.scanFile(context, filmId, fileId, { safe: false, reason: 'Malware' });
    await expect(service.getDownloadUrl(context, filmId, fileId)).rejects.toThrow('FILE_QUARANTINED');
  });

  it('creates background job and looks up status', async () => {
    const { service, recordedAudits } = setup({ hasMembership: true, canEdit: true });
    const job = await service.createJob(context, filmId, {
      queueName: 'exports',
      jobType: 'screenplay.export',
      payload: { docId: 'doc-1' },
      maxAttempts: 3,
    });

    expect(job.status).toBe('queued');
    const fetched = await service.getJob(context, filmId, job.id);
    expect(fetched.id).toBe(job.id);
    expect(recordedAudits).toHaveLength(1);
  });
});
