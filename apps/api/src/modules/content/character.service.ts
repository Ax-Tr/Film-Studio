import { randomUUID } from 'node:crypto';
import type {
  CharacterResourceDto,
  CreateCharacterDto,
  UpdateCharacterDto,
  CharacterRelationshipDto,
  SceneCardResourceDto,
  GlobalSearchResponseDto,
} from '@film-studio/contracts';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../authorization/permission.service.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type { CharacterRepository } from './character.repository.js';

export class CharacterService {
  constructor(
    private readonly repository: CharacterRepository,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async createCharacter(
    context: MutationContext,
    filmId: string,
    input: CreateCharacterDto,
  ): Promise<CharacterResourceDto> {
    await this.requireEdit(context, filmId);
    const id = randomUUID();
    const result = await this.repository.createCharacter(
      context.userId,
      filmId,
      id,
      input,
    );
    await this.recordAudit(
      context,
      filmId,
      'character.create',
      'character',
      id,
      { displayName: result.displayName },
    );
    return result;
  }

  async getCharacter(
    context: MutationContext,
    filmId: string,
    characterId: string,
  ): Promise<CharacterResourceDto | undefined> {
    await this.requireRead(context, filmId);
    return this.repository.getCharacter(context.userId, filmId, characterId);
  }

  async updateCharacter(
    context: MutationContext,
    filmId: string,
    characterId: string,
    input: UpdateCharacterDto,
  ): Promise<CharacterResourceDto> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.updateCharacter(
      context.userId,
      filmId,
      characterId,
      input,
    );
    await this.recordAudit(
      context,
      filmId,
      'character.update',
      'character',
      characterId,
      { version: result.version },
    );
    return result;
  }

  async deleteCharacter(
    context: MutationContext,
    filmId: string,
    characterId: string,
  ): Promise<void> {
    await this.requireEdit(context, filmId);
    await this.repository.deleteCharacter(context.userId, filmId, characterId);
    await this.recordAudit(
      context,
      filmId,
      'character.delete',
      'character',
      characterId,
      {},
    );
  }

  async listCharacters(
    context: MutationContext,
    filmId: string,
  ): Promise<readonly CharacterResourceDto[]> {
    await this.requireRead(context, filmId);
    return this.repository.listCharacters(context.userId, filmId);
  }

  async addRelationship(
    context: MutationContext,
    filmId: string,
    sourceId: string,
    targetId: string,
    type: string,
    description?: string,
  ): Promise<CharacterRelationshipDto> {
    await this.requireEdit(context, filmId);
    const result = await this.repository.addRelationship(
      context.userId,
      filmId,
      sourceId,
      targetId,
      type,
      description,
    );
    await this.recordAudit(
      context,
      filmId,
      'character.relationship.add',
      'character',
      sourceId,
      { targetId, type },
    );
    return result;
  }

  async listRelationships(
    context: MutationContext,
    filmId: string,
    characterId?: string,
  ): Promise<readonly CharacterRelationshipDto[]> {
    await this.requireRead(context, filmId);
    return this.repository.listRelationships(context.userId, filmId, characterId);
  }

  async listSceneCards(
    context: MutationContext,
    filmId: string,
    documentId: string,
  ): Promise<readonly SceneCardResourceDto[]> {
    await this.requireRead(context, filmId);
    return this.repository.listSceneCards(context.userId, filmId, documentId);
  }

  async updateSceneMetadata(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneId: string,
    meta: {
      slugline?: string;
      timeOfDay?: string;
      settingLocation?: string;
      summary?: string;
    },
  ): Promise<void> {
    await this.requireEdit(context, filmId);
    await this.repository.updateSceneMetadata(
      context.userId,
      filmId,
      documentId,
      sceneId,
      meta,
    );
    await this.recordAudit(
      context,
      filmId,
      'scene.metadata.update',
      'scene',
      sceneId,
      meta,
    );
  }

  async lockScene(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneId: string,
    lock: boolean,
  ): Promise<void> {
    await this.requireEdit(context, filmId);
    await this.repository.lockScene(
      context.userId,
      filmId,
      documentId,
      sceneId,
      lock,
    );
    await this.recordAudit(
      context,
      filmId,
      lock ? 'scene.lock' : 'scene.unlock',
      'scene',
      sceneId,
      { lock },
    );
  }

  async reorderScenes(
    context: MutationContext,
    filmId: string,
    documentId: string,
    sceneIdsInOrder: readonly string[],
  ): Promise<void> {
    await this.requireEdit(context, filmId);
    await this.repository.reorderScenes(
      context.userId,
      filmId,
      documentId,
      sceneIdsInOrder,
    );
    await this.recordAudit(
      context,
      filmId,
      'scene.reorder',
      'document',
      documentId,
      { count: sceneIdsInOrder.length },
    );
  }

  async globalSearch(
    context: MutationContext,
    filmId: string,
    query: string,
  ): Promise<GlobalSearchResponseDto> {
    await this.requireRead(context, filmId);
    return this.repository.globalSearch(context.userId, filmId, query);
  }

  private async requireRead(context: MutationContext, filmId: string): Promise<void> {
    await this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.read',
    );
  }

  private async requireEdit(context: MutationContext, filmId: string): Promise<void> {
    await this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.documents.edit',
    );
  }

  private async recordAudit(
    context: MutationContext,
    filmId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Readonly<Record<string, string | number | boolean>>,
  ): Promise<void> {
    await this.audit.record({
      action,
      actorUserId: context.userId,
      filmId,
      outcome: 'success',
      targetType,
      targetId,
      requestId: context.requestId,
      metadata,
    });
  }
}
