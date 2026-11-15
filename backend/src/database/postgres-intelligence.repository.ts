import type { Pool, PoolClient } from 'pg';
import type {
  SequenceResourceDto,
  CreateSequenceDto,
  CharacterArcDto,
  UpsertCharacterArcDto,
  SceneIntelligenceDto,
  ScreenplayPacingReportDto,
} from '@film-studio/contracts';

export class PostgresIntelligenceRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // Sequences
  async createSequence(data: CreateSequenceDto, client?: PoolClient): Promise<SequenceResourceDto> {
    const act = data.act ?? 1;
    const maxPosRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(position), 0) + 1000 AS next_pos
       FROM sequences
       WHERE film_id = $1 AND document_id = $2`,
      [data.filmId, data.documentId]
    );
    const position = data.sortOrder ?? Number(maxPosRes.rows[0].next_pos);

    const res = await this.getExecutor(client).query(
      `INSERT INTO sequences (film_id, document_id, title, dramatic_purpose, act_number, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, film_id, document_id, title, dramatic_purpose, act_number, position, created_at, updated_at`,
      [
        data.filmId,
        data.documentId,
        data.title,
        data.dramaticPurpose ?? null,
        act,
        position,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      title: row.title,
      dramaticPurpose: row.dramatic_purpose,
      act: row.act_number,
      sortOrder: Number(row.position),
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async listSequences(filmId: string, documentId: string, client?: PoolClient): Promise<SequenceResourceDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, document_id, title, dramatic_purpose, act_number, position, created_at, updated_at
       FROM sequences
       WHERE film_id = $1 AND document_id = $2 AND deleted_at IS NULL
         AND app_security.has_active_film_membership($1)
       ORDER BY act_number ASC, position ASC, created_at ASC`,
      [filmId, documentId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      documentId: row.document_id,
      title: row.title,
      dramaticPurpose: row.dramatic_purpose,
      act: row.act_number,
      sortOrder: Number(row.position),
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  // Scene Intelligence
  async updateSceneIntelligence(
    filmId: string,
    documentId: string,
    data: SceneIntelligenceDto,
    client?: PoolClient
  ): Promise<void> {
    await this.getExecutor(client).query(
      `UPDATE scenes
       SET sequence_id = $1,
           dramatic_purpose = $2,
           tone = $3,
           emotional_polarity = $4,
           scene_status = $5,
           tags = $6,
           notes = $7,
           updated_at = now()
       WHERE film_id = $8 AND document_id = $9 AND id = $10`,
      [
        data.sequenceId ?? null,
        data.dramaticPurpose ?? null,
        data.tone ?? null,
        data.emotionalPolarity ?? null,
        data.sceneStatus,
        data.tags,
        data.notes ?? null,
        filmId,
        documentId,
        data.sceneId,
      ]
    );
  }

  // Character Arcs
  async getCharacterArc(filmId: string, characterId: string, client?: PoolClient): Promise<CharacterArcDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, character_id, starting_state, transformation_catalyst, climax_choice,
              resolution_state, flaw, internal_need, external_goal, dialect_profile,
              voice_rhythm, vocabulary_notes, created_at, updated_at
       FROM character_arcs
       WHERE film_id = $1 AND character_id = $2
         AND app_security.has_active_film_membership($1)`,
      [filmId, characterId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      characterId: row.character_id,
      startingState: row.starting_state,
      transformationCatalyst: row.transformation_catalyst,
      climaxChoice: row.climax_choice,
      resolutionState: row.resolution_state,
      flaw: row.flaw,
      internalNeed: row.internal_need,
      externalGoal: row.external_goal,
      dialectProfile: row.dialect_profile,
      voiceRhythm: row.voice_rhythm,
      vocabularyNotes: row.vocabulary_notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async upsertCharacterArc(
    filmId: string,
    data: UpsertCharacterArcDto,
    client?: PoolClient
  ): Promise<CharacterArcDto> {
    const now = new Date();
    const res = await this.getExecutor(client).query(
      `INSERT INTO character_arcs (
         film_id, character_id, starting_state, transformation_catalyst, climax_choice,
         resolution_state, flaw, internal_need, external_goal, dialect_profile,
         voice_rhythm, vocabulary_notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       ON CONFLICT (film_id, character_id) DO UPDATE SET
         starting_state = EXCLUDED.starting_state,
         transformation_catalyst = EXCLUDED.transformation_catalyst,
         climax_choice = EXCLUDED.climax_choice,
         resolution_state = EXCLUDED.resolution_state,
         flaw = EXCLUDED.flaw,
         internal_need = EXCLUDED.internal_need,
         external_goal = EXCLUDED.external_goal,
         dialect_profile = EXCLUDED.dialect_profile,
         voice_rhythm = EXCLUDED.voice_rhythm,
         vocabulary_notes = EXCLUDED.vocabulary_notes,
         updated_at = EXCLUDED.updated_at
       RETURNING id, film_id, character_id, starting_state, transformation_catalyst, climax_choice,
                 resolution_state, flaw, internal_need, external_goal, dialect_profile,
                 voice_rhythm, vocabulary_notes, created_at, updated_at`,
      [
        filmId,
        data.characterId,
        data.startingState ?? null,
        data.transformationCatalyst ?? null,
        data.climaxChoice ?? null,
        data.resolutionState ?? null,
        data.flaw ?? null,
        data.internalNeed ?? null,
        data.externalGoal ?? null,
        data.dialectProfile ?? null,
        data.voiceRhythm ?? null,
        data.vocabularyNotes ?? null,
        now,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      characterId: row.character_id,
      startingState: row.starting_state,
      transformationCatalyst: row.transformation_catalyst,
      climaxChoice: row.climax_choice,
      resolutionState: row.resolution_state,
      flaw: row.flaw,
      internalNeed: row.internal_need,
      externalGoal: row.external_goal,
      dialectProfile: row.dialect_profile,
      voiceRhythm: row.voice_rhythm,
      vocabularyNotes: row.vocabulary_notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  // Pacing & Intelligence Analytics Report
  async generatePacingReport(
    filmId: string,
    documentId: string,
    client?: PoolClient
  ): Promise<ScreenplayPacingReportDto> {
    const scenesRes = await this.getExecutor(client).query(
      `SELECT id, sequence_id, emotional_polarity, scene_status
       FROM scenes
       WHERE film_id = $1 AND document_id = $2 AND deleted_at IS NULL
         AND app_security.has_active_film_membership($1)`,
      [filmId, documentId]
    );

    const seqsRes = await this.getExecutor(client).query(
      `SELECT id, title, act_number
       FROM sequences
       WHERE film_id = $1 AND document_id = $2 AND deleted_at IS NULL
         AND app_security.has_active_film_membership($1)
       ORDER BY act_number ASC, position ASC`,
      [filmId, documentId]
    );

    const charShareRes = await this.getExecutor(client).query(
      `SELECT c.id, c.display_name,
              COALESCE(SUM(sca.dialogue_word_count), 0)::integer AS total_words
       FROM characters c
       LEFT JOIN scene_character_appearances sca ON sca.film_id = c.film_id AND sca.character_id = c.id
       WHERE c.film_id = $1
         AND app_security.has_active_film_membership($1)
       GROUP BY c.id, c.display_name
       ORDER BY total_words DESC`,
      [filmId]
    );

    const totalDialogueWords = charShareRes.rows.reduce(
      (sum, r) => sum + (Number(r.total_words) || 0),
      0
    );

    const characterDialogueShare = charShareRes.rows.map((r) => {
      const words = Number(r.total_words) || 0;
      const pct = totalDialogueWords > 0 ? (words / totalDialogueWords) * 100 : 0;
      return {
        characterId: r.id,
        displayName: r.display_name,
        dialogueWords: words,
        percentage: Math.round(pct * 10) / 10,
      };
    });

    const actBreakdown: Record<string, { sceneCount: number; estimatedMinutes: number; sequences: string[] }> = {
      'Act 1': { sceneCount: 0, estimatedMinutes: 0, sequences: [] },
      'Act 2': { sceneCount: 0, estimatedMinutes: 0, sequences: [] },
      'Act 3': { sceneCount: 0, estimatedMinutes: 0, sequences: [] },
    };

    for (const seq of seqsRes.rows) {
      const actKey = `Act ${seq.act_number}`;
      if (actBreakdown[actKey]) {
        actBreakdown[actKey].sequences.push(seq.title);
      }
    }

    const totalScenes = scenesRes.rows.length;
    // Estimate standard screenplay pacing: roughly 1.5 minutes per scene
    actBreakdown['Act 1']!.sceneCount = Math.floor(totalScenes * 0.25);
    actBreakdown['Act 1']!.estimatedMinutes = Math.round(actBreakdown['Act 1']!.sceneCount * 1.5);

    actBreakdown['Act 2']!.sceneCount = Math.floor(totalScenes * 0.5);
    actBreakdown['Act 2']!.estimatedMinutes = Math.round(actBreakdown['Act 2']!.sceneCount * 1.5);

    actBreakdown['Act 3']!.sceneCount = totalScenes - actBreakdown['Act 1']!.sceneCount - actBreakdown['Act 2']!.sceneCount;
    actBreakdown['Act 3']!.estimatedMinutes = Math.round(actBreakdown['Act 3']!.sceneCount * 1.5);

    return {
      filmId,
      totalScenes,
      totalSequences: seqsRes.rows.length,
      actBreakdown,
      characterDialogueShare,
    };
  }
}
