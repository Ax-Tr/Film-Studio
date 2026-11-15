import { describe, expect, it } from 'vitest';
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
import { SyncService } from '../src/modules/sync/sync.service.js';
import type { SyncRepository } from '../src/modules/sync/sync.repository.js';
import type { MutationContext } from '../src/modules/tenant/tenant.service.js';
import {
  encodeSyncCursor,
  type ClientOperation,
  type ConflictRecord,
  type SyncPullResponse,
  type SyncPushResult,
} from '@film-studio/sync-core';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const sessionId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const filmId = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const deviceId = '018f4ce4-f001-7000-8000-000000000001';

const context: MutationContext = {
  userId,
  sessionId,
  requestId: 'req-sync-001',
};

class FakeSyncRepository implements SyncRepository {
  pushed: ClientOperation[] = [];
  acknowledged: { deviceId: string; revision: number }[] = [];
  resolved: { conflictId: string; choice: string }[] = [];

  async pushOperations(
    ...args: [string, string, readonly ClientOperation[]]
  ): Promise<{ results: SyncPushResult[]; latestServerRevision: number }> {
    const operations = args[2];
    this.pushed.push(...operations);
    return {
      results: operations.map((op) => ({ opId: op.opId, status: 'applied', serverRevision: 1 })),
      latestServerRevision: 1,
    };
  }

  async pullOperations(
    ...args: [string, string, number, number]
  ): Promise<SyncPullResponse> {
    const [, filmId, cursorRevision] = args;
    return {
      kind: 'operations',
      operations: [],
      nextCursor: encodeSyncCursor({ filmId, revision: cursorRevision, issuedAt: new Date().toISOString() }),
      hasMore: false,
      latestServerRevision: cursorRevision,
    };
  }

  async acknowledgeRevision(
    ...args: [string, string, string, number]
  ): Promise<void> {
    const [, , devId, serverRevision] = args;
    this.acknowledged.push({ deviceId: devId, revision: serverRevision });
  }

  async listConflicts(): Promise<ConflictRecord[]> {
    return [];
  }

  async resolveConflict(
    ...args: [
      string,
      string,
      string,
      {
        choice: 'keep_local' | 'keep_remote' | 'merge' | 'save_alternative';
        mergedPayload?: Record<string, unknown>;
      },
    ]
  ): Promise<ConflictRecord> {
    const [, filmId, conflictId, resolution] = args;
    this.resolved.push({ conflictId, choice: resolution.choice });
    return {
      id: conflictId,
      filmId,
      operationId: '018f4ce4-aaaa-7000-8000-000000000001',
      actorUserId: userId,
      deviceId,
      conflictType: 'SAME_FIELD_CHANGED',
      entityType: 'document',
      entityId: '018f4ce4-bbbb-7000-8000-000000000002',
      baseVersion: 1,
      serverVersion: 2,
      clientPayload: {},
      serverPayload: {},
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
      resolutionStrategy: resolution.choice,
      createdAt: new Date().toISOString(),
    };
  }

  async setCompactionFloor(
    ...args: [string, string, number]
  ): Promise<number> {
    return args[2];
  }
}

function setup(options: { hasMembership: boolean; canEdit: boolean }) {
  const repository = new FakeSyncRepository();
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
  const service = new SyncService(repository, permissions, audit);

  return { service, repository, recordedAudits };
}

describe('SyncService', () => {
  const testOp: ClientOperation = {
    schemaVersion: 1,
    opId: '018f4ce4-aaaa-7000-8000-000000000001',
    filmId,
    actorUserId: userId,
    deviceId,
    clientSequence: 1,
    entityType: 'document',
    entityId: '018f4ce4-bbbb-7000-8000-000000000002',
    kind: 'document.metadata.patch',
    baseVersion: 1,
    payload: { title: 'New Title' },
    createdAtClient: new Date().toISOString(),
  };

  it('allows authorized editor to push operations and logs audit event', async () => {
    const { service, repository, recordedAudits } = setup({ hasMembership: true, canEdit: true });
    const result = await service.pushOperations(context, filmId, [testOp]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe('applied');
    expect(repository.pushed).toHaveLength(1);
    expect(recordedAudits).toHaveLength(1);
  });

  it('rejects push if user is not a member of the film', async () => {
    const { service } = setup({ hasMembership: false, canEdit: false });
    await expect(service.pushOperations(context, filmId, [testOp])).rejects.toThrow(
      'Film permission was denied.',
    );
  });

  it('rejects push if user lacks edit permission', async () => {
    const { service } = setup({ hasMembership: true, canEdit: false });
    await expect(service.pushOperations(context, filmId, [testOp])).rejects.toThrow(
      'Film permission was denied.',
    );
  });

  it('allows pulling operations with valid cursor and records audit', async () => {
    const { service, recordedAudits } = setup({ hasMembership: true, canEdit: false });
    const cursor = encodeSyncCursor({ filmId, revision: 10, issuedAt: new Date().toISOString() });
    const response = await service.pullOperations(context, filmId, cursor);

    expect(response.kind).toBe('operations');
    expect(recordedAudits).toHaveLength(1);
  });

  it('rejects pull with corrupted cursor', async () => {
    const { service } = setup({ hasMembership: true, canEdit: false });
    await expect(service.pullOperations(context, filmId, 'invalid-cursor')).rejects.toThrow(
      'SYNC_INVALID_CURSOR',
    );
  });

  it('acknowledges revision and logs audit', async () => {
    const { service, repository, recordedAudits } = setup({ hasMembership: true, canEdit: false });
    await service.acknowledgeRevision(context, filmId, deviceId, 5);

    expect(repository.acknowledged).toHaveLength(1);
    expect(repository.acknowledged[0]).toEqual({ deviceId, revision: 5 });
    expect(recordedAudits).toHaveLength(1);
  });

  it('resolves conflict with edit permission and logs audit', async () => {
    const { service, repository, recordedAudits } = setup({ hasMembership: true, canEdit: true });
    const conflictId = '018f4ce4-cccc-7000-8000-000000000003';
    const resolved = await service.resolveConflict(context, filmId, conflictId, {
      choice: 'merge',
    });

    expect(resolved.resolutionStrategy).toBe('merge');
    expect(repository.resolved).toHaveLength(1);
    expect(recordedAudits).toHaveLength(1);
  });
});
