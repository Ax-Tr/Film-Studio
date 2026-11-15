import { createHmac } from 'node:crypto';
import {
  allowedMimeTypes,
  type CreateBackgroundJobDto,
  type RequestUploadUrlDto,
} from '@film-studio/contracts';
import { redactTelemetry } from '@film-studio/jobs';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../authorization/permission.service.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type {
  BackgroundJobRecord,
  FileRecord,
  PostgresFilesJobsRepository,
} from '../../database/postgres-files-jobs.repository.js';

export function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

export class FilesJobsService {
  private readonly signingSecret = 'storyforge-signed-url-secret-key-12345';

  constructor(
    private readonly repository: PostgresFilesJobsRepository,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async requestUploadUrl(
    context: MutationContext,
    filmId: string,
    input: RequestUploadUrlDto,
  ): Promise<{
    fileId: string;
    storageKey: string;
    uploadUrl: string;
    expiresAt: string;
  }> {
    await this.requireUpload(context, filmId);

    // Validate MIME type
    if (!(allowedMimeTypes as readonly string[]).includes(input.mimeType)) {
      throw codedError('INVALID_MIME_TYPE');
    }

    const file = await this.repository.createFile(context.userId, filmId, {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256Hex: input.sha256Hex,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const signature = this.signToken(file.id, file.storageKey, expiresAt);
    const uploadUrl = `https://storage.storyforge.example/upload/${file.storageKey}?token=${signature}&expires=${expiresAt}`;

    await this.recordAudit(
      context,
      filmId,
      'file.upload.request',
      'success',
      'file',
      file.id,
      {
        fileSize: input.sizeBytes,
        mime: input.mimeType,
      },
    );

    return {
      fileId: file.id,
      storageKey: file.storageKey,
      uploadUrl,
      expiresAt,
    };
  }

  async getFile(
    context: MutationContext,
    filmId: string,
    fileId: string,
  ): Promise<FileRecord> {
    await this.requireRead(context, filmId);
    const file = await this.repository.findFile(context.userId, filmId, fileId);
    if (!file) {
      throw codedError('FILE_NOT_FOUND');
    }
    return file;
  }

  async getDownloadUrl(
    context: MutationContext,
    filmId: string,
    fileId: string,
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    await this.requireRead(context, filmId);
    const file = await this.repository.findFile(context.userId, filmId, fileId);
    if (!file) {
      throw codedError('FILE_NOT_FOUND');
    }
    if (file.status === 'quarantined') {
      throw codedError('FILE_QUARANTINED');
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const signature = this.signToken(file.id, file.storageKey, expiresAt);
    const downloadUrl = `https://storage.storyforge.example/download/${file.storageKey}?token=${signature}&expires=${expiresAt}`;

    await this.recordAudit(
      context,
      filmId,
      'file.download.request',
      'success',
      'file',
      file.id,
      {
        fileSize: file.sizeBytes,
        mime: file.mimeType,
      },
    );

    return { downloadUrl, expiresAt };
  }

  async scanFile(
    context: MutationContext,
    filmId: string,
    fileId: string,
    scanResult: { safe: boolean; reason?: string },
  ): Promise<FileRecord> {
    await this.requireUpload(context, filmId);
    const newStatus: FileRecord['status'] = scanResult.safe
      ? 'ready'
      : 'quarantined';
    const updated = await this.repository.updateFileStatus(
      context.userId,
      filmId,
      fileId,
      newStatus,
      scanResult.reason,
    );

    await this.recordAudit(
      context,
      filmId,
      'file.scan',
      scanResult.safe ? 'success' : 'failed',
      'file',
      fileId,
      {
        status: newStatus,
      },
    );

    return updated;
  }

  async createJob(
    context: MutationContext,
    filmId: string,
    input: CreateBackgroundJobDto,
  ): Promise<BackgroundJobRecord> {
    await this.requireJobCreate(context, filmId);

    const job = await this.repository.createJob(context.userId, filmId, {
      queueName: input.queueName,
      jobType: input.jobType,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      payload: input.payload,
      maxAttempts: input.maxAttempts,
    });

    await this.recordAudit(
      context,
      filmId,
      'job.create',
      'success',
      'background_job',
      job.id,
      {
        queue: input.queueName,
        jobType: input.jobType,
      },
    );

    return job;
  }

  async getJob(
    context: MutationContext,
    filmId: string,
    jobId: string,
  ): Promise<BackgroundJobRecord> {
    await this.requireJobRead(context, filmId);
    const job = await this.repository.findJob(context.userId, filmId, jobId);
    if (!job) {
      throw codedError('JOB_NOT_FOUND');
    }
    return job;
  }

  private requireRead(context: MutationContext, filmId: string): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.read',
    );
  }

  private requireUpload(
    context: MutationContext,
    filmId: string,
  ): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.edit',
    );
  }

  private requireJobCreate(
    context: MutationContext,
    filmId: string,
  ): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.edit',
    );
  }

  private requireJobRead(
    context: MutationContext,
    filmId: string,
  ): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.read',
    );
  }

  private signToken(
    fileId: string,
    storageKey: string,
    expiresAt: string,
  ): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${fileId}:${storageKey}:${expiresAt}`, 'utf8')
      .digest('hex');
  }

  private recordAudit(
    context: MutationContext,
    filmId: string,
    action: string,
    outcome: 'success' | 'denied' | 'failed',
    targetType: string,
    targetId: string,
    metadata: Record<string, string | number | boolean>,
  ) {
    const cleanMetadata = redactTelemetry(metadata);
    return this.audit.record({
      actorUserId: context.userId,
      actorSessionId: context.sessionId,
      filmId,
      action,
      outcome,
      targetType,
      targetId,
      requestId: context.requestId,
      metadata: cleanMetadata as Record<string, string | number | boolean>,
      ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
      ...(context.userAgent === undefined
        ? {}
        : { userAgent: context.userAgent }),
    });
  }
}
