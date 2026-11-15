import {
  decodeSyncCursor,
  type ClientOperation,
  type ConflictRecord,
  type SyncPullResponse,
  type SyncPushResult,
} from '@film-studio/sync-core';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../authorization/permission.service.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type { SyncRepository } from './sync.repository.js';

export function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

export class SyncService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async pushOperations(
    context: MutationContext,
    filmId: string,
    operations: readonly ClientOperation[],
  ): Promise<{ results: SyncPushResult[]; latestServerRevision: number }> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.pushOperations(
      context.userId,
      filmId,
      operations,
    );
    await this.recordAudit(
      context,
      filmId,
      'sync.push',
      'success',
      'sync_batch',
      filmId,
      {
        operationCount: operations.length,
        latestServerRevision: result.latestServerRevision,
      },
    );
    return result;
  }

  async pullOperations(
    context: MutationContext,
    filmId: string,
    cursor?: string,
    limit = 100,
  ): Promise<SyncPullResponse> {
    await this.requireMember(context, filmId);
    let cursorRevision = 0;
    if (cursor) {
      const decoded = decodeSyncCursor(cursor);
      if (!decoded || decoded.filmId !== filmId) {
        throw codedError('SYNC_INVALID_CURSOR');
      }
      cursorRevision = decoded.revision;
    }

    const response = await this.repository.pullOperations(
      context.userId,
      filmId,
      cursorRevision,
      limit,
    );

    await this.recordAudit(
      context,
      filmId,
      'sync.pull',
      'success',
      'sync_feed',
      filmId,
      {
        cursorRevision,
        count: response.operations.length,
      },
    );

    return response;
  }

  async acknowledgeRevision(
    context: MutationContext,
    filmId: string,
    deviceId: string,
    serverRevision: number,
  ): Promise<void> {
    await this.requireMember(context, filmId);
    await this.repository.acknowledgeRevision(
      context.userId,
      filmId,
      deviceId,
      serverRevision,
    );
    await this.recordAudit(
      context,
      filmId,
      'sync.ack',
      'success',
      'sync_device',
      deviceId,
      {
        serverRevision,
      },
    );
  }

  async listConflicts(
    context: MutationContext,
    filmId: string,
  ): Promise<ConflictRecord[]> {
    await this.requireMember(context, filmId);
    return this.repository.listConflicts(context.userId, filmId);
  }

  async resolveConflict(
    context: MutationContext,
    filmId: string,
    conflictId: string,
    resolution: {
      choice: 'keep_local' | 'keep_remote' | 'merge' | 'save_alternative';
      mergedPayload?: Record<string, unknown>;
    },
  ): Promise<ConflictRecord> {
    await this.requireEdit(context, filmId);
    const resolved = await this.repository.resolveConflict(
      context.userId,
      filmId,
      conflictId,
      resolution,
    );
    await this.recordAudit(
      context,
      filmId,
      'sync.conflict.resolve',
      'success',
      'sync_conflict',
      conflictId,
      {
        choice: resolution.choice,
      },
    );
    return resolved;
  }

  async setCompactionFloor(
    context: MutationContext,
    filmId: string,
    floorRevision: number,
  ): Promise<number> {
    await this.requireAdmin(context, filmId);
    return this.repository.setCompactionFloor(
      context.userId,
      filmId,
      floorRevision,
    );
  }

  private requireMember(
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

  private requireEdit(
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

  private requireAdmin(
    context: MutationContext,
    filmId: string,
  ): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.manage',
    );
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
    return this.audit.record({
      actorUserId: context.userId,
      actorSessionId: context.sessionId,
      filmId,
      action,
      outcome,
      targetType,
      targetId,
      requestId: context.requestId,
      metadata,
      ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
      ...(context.userAgent === undefined
        ? {}
        : { userAgent: context.userAgent }),
    });
  }
}
