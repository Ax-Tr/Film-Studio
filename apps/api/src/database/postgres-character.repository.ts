import type { Pool } from 'pg';
import type {
  CharacterResourceDto,
  CreateCharacterDto,
  UpdateCharacterDto,
  CharacterRelationshipDto,
  SceneCardResourceDto,
  GlobalSearchResponseDto,
  SearchResultItemDto,
} from '@film-studio/contracts';
import type { CharacterRepository } from '../modules/content/character.repository.js';
import { codedError } from '../modules/content/content.service.js';

interface CharacterRow {
  id: string;
  film_id: string;
  display_name: string;
  aliases: string[];
  profile: Record<string, unknown>;
  voice_traits: Record<string, unknown>;
  arc_summary: string | null;
  version: string;
  created_at: Date | string;
  updated_at: Date | string;
  total_scenes?: string;
  total_dialogue_blocks?: string;
  total_dialogue_words?: string;
}

interface RelationshipRow {
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresCharacterRepository implements CharacterRepository {
  constructor(private readonly pool: Pool) {}

  async createCharacter(
    userId: string,
    filmId: string,
    id: string,
    input: CreateCharacterDto,
  ): Promise<CharacterResourceDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const result = await client.query<CharacterRow>(
        `INSERT INTO characters (
           id, film_id, display_name, aliases, profile, voice_traits, arc_summary, version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
         RETURNING *`,
        [
          id,
          filmId,
          input.displayName,
          input.aliases ?? [],
          JSON.stringify(input.profile ?? {}),
          JSON.stringify(input.voiceTraits ?? {}),
          input.arcSummary ?? null,
        ],
      );

      await client.query('COMMIT');
      return this.mapCharacter(result.rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getCharacter(
    userId: string,
    filmId: string,
    characterId: string,
  ): Promise<CharacterResourceDto | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const result = await client.query<CharacterRow>(
        `SELECT c.*,
                COALESCE(COUNT(DISTINCT a.scene_id), 0) AS total_scenes,
                COALESCE(SUM(a.dialogue_block_count), 0) AS total_dialogue_blocks,
                COALESCE(SUM(a.dialogue_word_count), 0) AS total_dialogue_words
         FROM characters c
         LEFT JOIN scene_character_appearances a
           ON a.film_id = c.film_id AND a.character_id = c.id
         WHERE c.film_id = $1 AND c.id = $2 AND c.deleted_at IS NULL
         GROUP BY c.id`,
        [filmId, characterId],
      );

      if (result.rows.length === 0) return undefined;
      return this.mapCharacter(result.rows[0]!);
    } finally {
      client.release();
    }
  }

  async updateCharacter(
    userId: string,
    filmId: string,
    characterId: string,
    input: UpdateCharacterDto,
  ): Promise<CharacterResourceDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const current = await client.query<CharacterRow>(
        'SELECT * FROM characters WHERE film_id = $1 AND id = $2 AND deleted_at IS NULL',
        [filmId, characterId],
      );

      if (current.rows.length === 0) throw codedError('CHARACTER_NOT_FOUND');
      const row = current.rows[0]!;
      if (Number(row.version) !== input.expectedVersion) {
        throw codedError('CONCURRENT_MODIFICATION');
      }

      const updated = await client.query<CharacterRow>(
        `UPDATE characters
         SET display_name = COALESCE($1, display_name),
             aliases = COALESCE($2, aliases),
             profile = COALESCE($3, profile),
             voice_traits = COALESCE($4, voice_traits),
             arc_summary = COALESCE($5, arc_summary),
             version = version + 1,
             updated_at = now()
         WHERE film_id = $6 AND id = $7
         RETURNING *`,
        [
          input.displayName ?? null,
          input.aliases ?? null,
          input.profile ? JSON.stringify(input.profile) : null,
          input.voiceTraits ? JSON.stringify(input.voiceTraits) : null,
          input.arcSummary !== undefined ? input.arcSummary : null,
          filmId,
          characterId,
        ],
      );

      await client.query('COMMIT');
      return this.mapCharacter(updated.rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteCharacter(
    userId: string,
    filmId: string,
    characterId: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      await client.query(
        'UPDATE characters SET deleted_at = now() WHERE film_id = $1 AND id = $2',
        [filmId, characterId],
      );
    } finally {
      client.release();
    }
  }

  async listCharacters(
    userId: string,
    filmId: string,
  ): Promise<readonly CharacterResourceDto[]> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const result = await client.query<CharacterRow>(
        `SELECT c.*,
                COALESCE(COUNT(DISTINCT a.scene_id), 0) AS total_scenes,
                COALESCE(SUM(a.dialogue_block_count), 0) AS total_dialogue_blocks,
                COALESCE(SUM(a.dialogue_word_count), 0) AS total_dialogue_words
         FROM characters c
         LEFT JOIN scene_character_appearances a
           ON a.film_id = c.film_id AND a.character_id = c.id
         WHERE c.film_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id
         ORDER BY c.display_name ASC`,
        [filmId],
      );

      return result.rows.map((r) => this.mapCharacter(r));
    } finally {
      client.release();
    }
  }

  async addRelationship(
    userId: string,
    filmId: string,
    sourceId: string,
    targetId: string,
    type: string,
    description?: string,
  ): Promise<CharacterRelationshipDto> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const result = await client.query<RelationshipRow>(
        `INSERT INTO character_relationships (
           film_id, source_character_id, target_character_id, relationship_type, description
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (film_id, source_character_id, target_character_id)
         DO UPDATE SET relationship_type = EXCLUDED.relationship_type,
                       description = EXCLUDED.description,
                       updated_at = now()
         RETURNING *`,
        [filmId, sourceId, targetId, type, description ?? null],
      );

      const r = result.rows[0]!;
      return {
        sourceCharacterId: r.source_character_id,
        targetCharacterId: r.target_character_id,
        relationshipType: r.relationship_type,
        ...(r.description ? { description: r.description } : {}),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async listRelationships(
    userId: string,
    filmId: string,
    characterId?: string,
  ): Promise<readonly CharacterRelationshipDto[]> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const query = characterId
        ? `SELECT * FROM character_relationships
           WHERE film_id = $1 AND (source_character_id = $2 OR target_character_id = $2)
           ORDER BY created_at ASC`
        : `SELECT * FROM character_relationships WHERE film_id = $1 ORDER BY created_at ASC`;

      const params = characterId ? [filmId, characterId] : [filmId];
      const result = await client.query<RelationshipRow>(query, params);

      return result.rows.map((r) => ({
        sourceCharacterId: r.source_character_id,
        targetCharacterId: r.target_character_id,
        relationshipType: r.relationship_type,
        ...(r.description ? { description: r.description } : {}),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  async listSceneCards(
    userId: string,
    filmId: string,
    documentId: string,
  ): Promise<readonly SceneCardResourceDto[]> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const scenesRes = await client.query<{
        id: string;
        film_id: string;
        document_id: string;
        version: string;
        position: string;
        slugline: string | null;
        time_of_day: string | null;
        setting_location: string | null;
        summary: string | null;
        is_locked: boolean;
        locked_by: string | null;
        locked_at: Date | string | null;
      }>(
        `SELECT s.id, s.film_id, s.document_id, s.version,
                o.position, s.slugline, s.time_of_day, s.setting_location,
                s.summary, s.is_locked, s.locked_by, s.locked_at
         FROM scenes s
         JOIN document_scene_order o
           ON o.film_id = s.film_id AND o.document_id = s.document_id AND o.scene_id = s.id
         WHERE s.film_id = $1 AND s.document_id = $2 AND s.deleted_at IS NULL
         ORDER BY o.position ASC`,
        [filmId, documentId],
      );

      const appsRes = await client.query<{
        scene_id: string;
        character_id: string;
        display_name: string;
        dialogue_block_count: number;
        dialogue_word_count: number;
      }>(
        `SELECT a.scene_id, a.character_id, c.display_name,
                a.dialogue_block_count, a.dialogue_word_count
         FROM scene_character_appearances a
         JOIN characters c ON c.id = a.character_id
         WHERE a.film_id = $1 AND a.document_id = $2`,
        [filmId, documentId],
      );

      const appsByScene = new Map<string, Array<{
        characterId: string;
        displayName: string;
        dialogueBlockCount: number;
        dialogueWordCount: number;
      }>>();

      for (const app of appsRes.rows) {
        let list = appsByScene.get(app.scene_id);
        if (!list) {
          list = [];
          appsByScene.set(app.scene_id, list);
        }
        list.push({
          characterId: app.character_id,
          displayName: app.display_name,
          dialogueBlockCount: Number(app.dialogue_block_count),
          dialogueWordCount: Number(app.dialogue_word_count),
        });
      }

      return scenesRes.rows.map((row) => {
        const characters = appsByScene.get(row.id) ?? [];
        const totalWords = characters.reduce((sum, c) => sum + c.dialogueWordCount, 0);

        return {
          id: row.id,
          filmId: row.film_id,
          documentId: row.document_id,
          position: Number(row.position),
          slugline: row.slugline,
          timeOfDay: row.time_of_day,
          settingLocation: row.setting_location,
          summary: row.summary,
          isLocked: Boolean(row.is_locked),
          lockedBy: row.locked_by,
          lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
          version: Number(row.version),
          characters,
          wordCount: totalWords,
        };
      });
    } finally {
      client.release();
    }
  }

  async updateSceneMetadata(
    userId: string,
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
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      await client.query(
        `UPDATE scenes
         SET slugline = COALESCE($1, slugline),
             time_of_day = COALESCE($2, time_of_day),
             setting_location = COALESCE($3, setting_location),
             summary = COALESCE($4, summary),
             version = version + 1
         WHERE film_id = $5 AND document_id = $6 AND id = $7 AND deleted_at IS NULL`,
        [
          meta.slugline ?? null,
          meta.timeOfDay ?? null,
          meta.settingLocation ?? null,
          meta.summary ?? null,
          filmId,
          documentId,
          sceneId,
        ],
      );
    } finally {
      client.release();
    }
  }

  async lockScene(
    userId: string,
    filmId: string,
    documentId: string,
    sceneId: string,
    lock: boolean,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      await client.query(
        `UPDATE scenes
         SET is_locked = $1,
             locked_by = CASE WHEN $1 THEN $2::uuid ELSE NULL END,
             locked_at = CASE WHEN $1 THEN now() ELSE NULL END,
             version = version + 1
         WHERE film_id = $3 AND document_id = $4 AND id = $5 AND deleted_at IS NULL`,
        [lock, userId, filmId, documentId, sceneId],
      );
    } finally {
      client.release();
    }
  }

  async reorderScenes(
    userId: string,
    filmId: string,
    documentId: string,
    sceneIdsInOrder: readonly string[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      // Temporary large positive offset (100,000) to satisfy CHECK (position >= 0)
      const offset = 100000;
      for (let i = 0; i < sceneIdsInOrder.length; i++) {
        await client.query(
          `UPDATE document_scene_order
           SET position = $1
           WHERE film_id = $2 AND document_id = $3 AND scene_id = $4`,
          [offset + i, filmId, documentId, sceneIdsInOrder[i]],
        );
      }

      // Assign final positions (0, 1, 2, ...)
      for (let i = 0; i < sceneIdsInOrder.length; i++) {
        await client.query(
          `UPDATE document_scene_order
           SET position = $1
           WHERE film_id = $2 AND document_id = $3 AND scene_id = $4`,
          [i, filmId, documentId, sceneIdsInOrder[i]],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recordSceneAppearance(
    userId: string,
    filmId: string,
    documentId: string,
    sceneId: string,
    characterId: string,
    dialogueBlockCount: number,
    dialogueWordCount: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      await client.query(
        `INSERT INTO scene_character_appearances (
           film_id, document_id, scene_id, character_id, dialogue_block_count, dialogue_word_count
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (film_id, scene_id, character_id)
         DO UPDATE SET dialogue_block_count = EXCLUDED.dialogue_block_count,
                       dialogue_word_count = EXCLUDED.dialogue_word_count`,
        [filmId, documentId, sceneId, characterId, dialogueBlockCount, dialogueWordCount],
      );
    } finally {
      client.release();
    }
  }

  async globalSearch(
    userId: string,
    filmId: string,
    query: string,
  ): Promise<GlobalSearchResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.film_id', $1, true)", [filmId]);

      const normalizedQuery = query.normalize('NFC').trim();
      const searchPattern = `%${normalizedQuery}%`;

      const results: SearchResultItemDto[] = [];

      // 1. Search characters
      const charRes = await client.query<{ id: string; display_name: string; aliases: string[] }>(
        `SELECT id, display_name, aliases
         FROM characters
         WHERE film_id = $1 AND deleted_at IS NULL
           AND (display_name ILIKE $2 OR $3 = ANY(aliases))
         LIMIT 20`,
        [filmId, searchPattern, normalizedQuery],
      );

      for (const row of charRes.rows) {
        results.push({
          type: 'character',
          id: row.id,
          filmId,
          title: row.display_name,
          snippet: `Aliases: ${(row.aliases ?? []).join(', ') || 'None'}`,
        });
      }

      // 2. Search scenes by slugline and summary
      const sceneRes = await client.query<{
        id: string;
        document_id: string;
        slugline: string | null;
        summary: string | null;
      }>(
        `SELECT id, document_id, slugline, summary
         FROM scenes
         WHERE film_id = $1 AND deleted_at IS NULL
           AND (slugline ILIKE $2 OR summary ILIKE $2)
         LIMIT 20`,
        [filmId, searchPattern],
      );

      for (const row of sceneRes.rows) {
        results.push({
          type: 'scene',
          id: row.id,
          filmId,
          documentId: row.document_id,
          sceneId: row.id,
          title: row.slugline ?? 'Scene',
          snippet: row.summary ?? 'No synopsis provided.',
        });
      }

      // 3. Search projected screenplay blocks
      const blockRes = await client.query<{
        id: string;
        document_id: string;
        scene_id: string;
        block_type: string;
        text_content: string;
      }>(
        `SELECT id, document_id, scene_id, block_type, text_content
         FROM screenplay_block_projections
         WHERE film_id = $1 AND text_content ILIKE $2
         LIMIT 30`,
        [filmId, searchPattern],
      );

      for (const row of blockRes.rows) {
        results.push({
          type: row.block_type === 'dialogue' ? 'dialogue' : 'action',
          id: row.id,
          filmId,
          documentId: row.document_id,
          sceneId: row.scene_id,
          title: `${row.block_type.toUpperCase()} block`,
          snippet: row.text_content.slice(0, 160),
        });
      }

      return {
        query: normalizedQuery,
        results,
        totalCount: results.length,
      };
    } finally {
      client.release();
    }
  }

  private mapCharacter(row: CharacterRow): CharacterResourceDto {
    return {
      id: row.id,
      filmId: row.film_id,
      displayName: row.display_name,
      aliases: row.aliases ?? [],
      profile: (row.profile ?? {}) as Record<string, unknown>,
      voiceTraits: (row.voice_traits ?? {}) as Record<string, unknown>,
      arcSummary: row.arc_summary,
      version: Number(row.version),
      totalScenes: row.total_scenes !== undefined ? Number(row.total_scenes) : 0,
      totalDialogueBlocks: row.total_dialogue_blocks !== undefined ? Number(row.total_dialogue_blocks) : 0,
      totalDialogueWords: row.total_dialogue_words !== undefined ? Number(row.total_dialogue_words) : 0,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
