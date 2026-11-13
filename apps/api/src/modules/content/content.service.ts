import { createHash } from 'node:crypto';
import {
  screenplayDocumentSchema,
  stableJson,
  type ScreenplayDocument,
} from '@film-studio/screenplay-model';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../authorization/permission.service.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type {
  ContentRepository,
  DocumentRecord,
  MutationIdentity,
  SceneRecord,
} from './content.repository.js';

export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async createDocument(
    context: MutationContext,
    filmId: string,
    input: {
      readonly operationId: string;
      readonly id: string;
      readonly title: string;
      readonly kind: string;
      readonly language: string;
    },
  ): Promise<DocumentRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.createDocument(
      this.mutation(
        context,
        filmId,
        input.operationId,
        'document.create',
        input,
      ),
      input,
    );
    await this.record(
      context,
      filmId,
      'document.create',
      'document',
      result.id,
    );
    return result;
  }

  async updateDocument(
    context: MutationContext,
    filmId: string,
    documentId: string,
    input: {
      readonly operationId: string;
      readonly expectedVersion: number;
      readonly title?: string | undefined;
      readonly kind?: string | undefined;
      readonly language?: string | undefined;
      readonly archived?: boolean | undefined;
    },
  ): Promise<DocumentRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.updateDocument(
      this.mutation(context, filmId, input.operationId, 'document.update', {
        documentId,
        ...input,
      }),
      documentId,
      input,
    );
    await this.record(
      context,
      filmId,
      'document.update',
      'document',
      documentId,
    );
    return result;
  }

  async getDocument(
    context: MutationContext,
    filmId: string,
    documentId: string,
  ): Promise<DocumentRecord> {
    await this.requireRead(context, filmId);
    const result = await this.repository.getDocument(
      context.userId,
      filmId,
      documentId,
    );
    if (result === undefined) throw codedError('MODEL_RESOURCE_NOT_FOUND');
    return result;
  }

  async listDocuments(
    context: MutationContext,
    filmId: string,
  ): Promise<readonly DocumentRecord[]> {
    await this.requireRead(context, filmId);
    return this.repository.listDocuments(context.userId, filmId);
  }

  async createScene(
    context: MutationContext,
    filmId: string,
    documentId: string,
    input: {
      readonly operationId: string;
      readonly id: string;
      readonly expectedDocumentVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.createScene(
      this.mutation(context, filmId, input.operationId, 'scene.create', {
        documentId,
        ...input,
      }),
      documentId,
      input,
    );
    await this.record(context, filmId, 'scene.create', 'scene', result.id);
    return result;
  }

  async moveScene(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneId: string,
    input: {
      readonly operationId: string;
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.moveScene(
      this.mutation(context, filmId, input.operationId, 'scene.move', {
        documentId,
        sceneId,
        ...input,
      }),
      documentId,
      sceneId,
      input,
    );
    await this.record(context, filmId, 'scene.move', 'scene', sceneId);
    return result;
  }

  async deleteScene(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneId: string,
    input: {
      readonly operationId: string;
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
    },
  ): Promise<SceneRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.deleteScene(
      this.mutation(context, filmId, input.operationId, 'scene.delete', {
        documentId,
        sceneId,
        ...input,
      }),
      documentId,
      sceneId,
      input.expectedDocumentVersion,
      input.expectedSceneVersion,
    );
    await this.record(context, filmId, 'scene.delete', 'scene', sceneId);
    return result;
  }

  async restoreScene(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneId: string,
    input: {
      readonly operationId: string;
      readonly expectedDocumentVersion: number;
      readonly expectedSceneVersion: number;
      readonly targetIndex: number;
    },
  ): Promise<SceneRecord> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.restoreScene(
      this.mutation(context, filmId, input.operationId, 'scene.restore', {
        documentId,
        sceneId,
        ...input,
      }),
      documentId,
      sceneId,
      input,
    );
    await this.record(context, filmId, 'scene.restore', 'scene', sceneId);
    return result;
  }

  async listScenes(
    context: MutationContext,
    filmId: string,
    documentId: string,
    includeDeleted: boolean,
  ): Promise<readonly SceneRecord[]> {
    await this.requireRead(context, filmId);
    return this.repository.listScenes(
      context.userId,
      filmId,
      documentId,
      includeDeleted,
    );
  }

  async createDocumentVersion(
    context: MutationContext,
    filmId: string,
    documentId: string,
    input: {
      readonly operationId: string;
      readonly id: string;
      readonly expectedDocumentVersion: number;
      readonly snapshot: unknown;
    },
  ) {
    await this.requireEdit(context, filmId);
    const snapshot: ScreenplayDocument = screenplayDocumentSchema.parse(
      input.snapshot,
    );
    if (snapshot.documentId !== documentId) {
      throw codedError('MODEL_SNAPSHOT_MISMATCH');
    }
    const serialized = stableJson(snapshot);
    const snapshotHash = createHash('sha256')
      .update(serialized, 'utf8')
      .digest();
    const result = await this.repository.createDocumentVersion(
      this.mutation(
        context,
        filmId,
        input.operationId,
        'document.version.create',
        {
          documentId,
          id: input.id,
          expectedDocumentVersion: input.expectedDocumentVersion,
          snapshotHash: snapshotHash.toString('hex'),
        },
      ),
      documentId,
      input.id,
      input.expectedDocumentVersion,
      snapshot,
      snapshotHash,
    );
    await this.record(
      context,
      filmId,
      'document.version.create',
      'document_version',
      input.id,
    );
    return result;
  }

  private mutation(
    context: MutationContext,
    filmId: string,
    operationId: string,
    operation: string,
    input: unknown,
  ): MutationIdentity {
    return {
      operationId,
      filmId,
      userId: context.userId,
      requestHash: createHash('sha256')
        .update(stableJson({ operation, input }), 'utf8')
        .digest(),
    };
  }

  private requireRead(context: MutationContext, filmId: string): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.read',
    );
  }

  private requireEdit(context: MutationContext, filmId: string): Promise<void> {
    return this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.edit',
    );
  }

  private record(
    context: MutationContext,
    filmId: string,
    action: string,
    targetType: string,
    targetId: string,
  ) {
    return this.audit.record({
      actorUserId: context.userId,
      actorSessionId: context.sessionId,
      filmId,
      action,
      outcome: 'success',
      targetType,
      targetId,
      requestId: context.requestId,
      ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
      ...(context.userAgent === undefined
        ? {}
        : { userAgent: context.userAgent }),
    });
  }
}

export function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}
