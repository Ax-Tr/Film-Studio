import type { Pool, PoolClient } from 'pg';
import type {
  StoryBibleDto,
  UpdateStoryBibleDto,
  StoryThreadDto,
  CreateStoryThreadDto,
  StoryBeatDto,
  CreateStoryBeatDto,
  StoryDevelopmentOverviewDto,
} from '@film-studio/contracts';

export class PostgresStoryRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  async getStoryBible(filmId: string, client?: PoolClient): Promise<StoryBibleDto | null> {
    const res = await this.getExecutor(client).query(
      `SELECT film_id, premise, theme, dramatic_question, narrative_structure,
              logline, short_synopsis, long_synopsis, treatment,
              world_building_rules, historical_context, created_at, updated_at
       FROM story_bibles
       WHERE film_id = $1
         AND app_security.has_active_film_membership($1)`,
      [filmId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      filmId: row.film_id,
      premise: row.premise,
      theme: row.theme,
      dramaticQuestion: row.dramatic_question,
      narrativeStructure: row.narrative_structure,
      logline: row.logline,
      shortSynopsis: row.short_synopsis,
      longSynopsis: row.long_synopsis,
      treatment: row.treatment,
      worldBuildingRules: row.world_building_rules ?? {},
      historicalContext: row.historical_context,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async upsertStoryBible(
    filmId: string,
    data: UpdateStoryBibleDto,
    client?: PoolClient
  ): Promise<StoryBibleDto> {
    const existing = await this.getStoryBible(filmId, client);
    const now = new Date();

    const premise = data.premise !== undefined ? data.premise : existing?.premise ?? null;
    const theme = data.theme !== undefined ? data.theme : existing?.theme ?? null;
    const dramaticQuestion = data.dramaticQuestion !== undefined ? data.dramaticQuestion : existing?.dramaticQuestion ?? null;
    const narrativeStructure = data.narrativeStructure ?? existing?.narrativeStructure ?? 'three_act';
    const logline = data.logline !== undefined ? data.logline : existing?.logline ?? null;
    const shortSynopsis = data.shortSynopsis !== undefined ? data.shortSynopsis : existing?.shortSynopsis ?? null;
    const longSynopsis = data.longSynopsis !== undefined ? data.longSynopsis : existing?.longSynopsis ?? null;
    const treatment = data.treatment !== undefined ? data.treatment : existing?.treatment ?? null;
    const worldBuildingRules = data.worldBuildingRules ?? existing?.worldBuildingRules ?? {};
    const historicalContext = data.historicalContext !== undefined ? data.historicalContext : existing?.historicalContext ?? null;

    await this.getExecutor(client).query(
      `INSERT INTO story_bibles (
         film_id, premise, theme, dramatic_question, narrative_structure,
         logline, short_synopsis, long_synopsis, treatment,
         world_building_rules, historical_context, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       ON CONFLICT (film_id) DO UPDATE SET
         premise = EXCLUDED.premise,
         theme = EXCLUDED.theme,
         dramatic_question = EXCLUDED.dramatic_question,
         narrative_structure = EXCLUDED.narrative_structure,
         logline = EXCLUDED.logline,
         short_synopsis = EXCLUDED.short_synopsis,
         long_synopsis = EXCLUDED.long_synopsis,
         treatment = EXCLUDED.treatment,
         world_building_rules = EXCLUDED.world_building_rules,
         historical_context = EXCLUDED.historical_context,
         updated_at = EXCLUDED.updated_at`,
      [
        filmId,
        premise,
        theme,
        dramaticQuestion,
        narrativeStructure,
        logline,
        shortSynopsis,
        longSynopsis,
        treatment,
        JSON.stringify(worldBuildingRules),
        historicalContext,
        now,
      ]
    );

    return (await this.getStoryBible(filmId, client))!;
  }

  async listThreads(filmId: string, client?: PoolClient): Promise<StoryThreadDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, title, color_hex, thread_type, description, sort_order, created_at, updated_at
       FROM story_threads
       WHERE film_id = $1
         AND app_security.has_active_film_membership($1)
       ORDER BY sort_order ASC, created_at ASC`,
      [filmId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      title: row.title,
      colorHex: row.color_hex,
      threadType: row.thread_type,
      description: row.description,
      sortOrder: row.sort_order,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async createThread(data: CreateStoryThreadDto, client?: PoolClient): Promise<StoryThreadDto> {
    const maxOrderRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM story_threads WHERE film_id = $1`,
      [data.filmId]
    );
    const sortOrder = data.sortOrder ?? maxOrderRes.rows[0].next_order;

    const res = await this.getExecutor(client).query(
      `INSERT INTO story_threads (film_id, title, color_hex, thread_type, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, film_id, title, color_hex, thread_type, description, sort_order, created_at, updated_at`,
      [
        data.filmId,
        data.title,
        data.colorHex ?? '#f3b74f',
        data.threadType ?? 'plot',
        data.description ?? null,
        sortOrder,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      title: row.title,
      colorHex: row.color_hex,
      threadType: row.thread_type,
      description: row.description,
      sortOrder: row.sort_order,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async listBeats(filmId: string, client?: PoolClient): Promise<StoryBeatDto[]> {
    const res = await this.getExecutor(client).query(
      `SELECT id, film_id, thread_id, act, title, beat_type, timing_minute, description, sort_order, linked_scene_id, created_at, updated_at
       FROM story_beats
       WHERE film_id = $1
         AND app_security.has_active_film_membership($1)
       ORDER BY act ASC, sort_order ASC, created_at ASC`,
      [filmId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      filmId: row.film_id,
      threadId: row.thread_id,
      act: row.act,
      title: row.title,
      beatType: row.beat_type,
      timingMinute: row.timing_minute,
      description: row.description,
      sortOrder: row.sort_order,
      linkedSceneId: row.linked_scene_id,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async createBeat(data: CreateStoryBeatDto, client?: PoolClient): Promise<StoryBeatDto> {
    const act = data.act ?? 1;
    const maxOrderRes = await this.getExecutor(client).query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM story_beats WHERE film_id = $1 AND act = $2`,
      [data.filmId, act]
    );
    const sortOrder = data.sortOrder ?? maxOrderRes.rows[0].next_order;

    const res = await this.getExecutor(client).query(
      `INSERT INTO story_beats (film_id, thread_id, act, title, beat_type, timing_minute, description, sort_order, linked_scene_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, film_id, thread_id, act, title, beat_type, timing_minute, description, sort_order, linked_scene_id, created_at, updated_at`,
      [
        data.filmId,
        data.threadId ?? null,
        act,
        data.title,
        data.beatType ?? 'beat',
        data.timingMinute ?? null,
        data.description ?? null,
        sortOrder,
        data.linkedSceneId ?? null,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      filmId: row.film_id,
      threadId: row.thread_id,
      act: row.act,
      title: row.title,
      beatType: row.beat_type,
      timingMinute: row.timing_minute,
      description: row.description,
      sortOrder: row.sort_order,
      linkedSceneId: row.linked_scene_id,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async getDevelopmentOverview(filmId: string, client?: PoolClient): Promise<StoryDevelopmentOverviewDto> {
    const [bible, threads, beats] = await Promise.all([
      this.getStoryBible(filmId, client),
      this.listThreads(filmId, client),
      this.listBeats(filmId, client),
    ]);

    return {
      bible,
      threads,
      beats,
    };
  }
}
