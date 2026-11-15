import type { Pool, PoolClient } from 'pg';
import type {
  ProjectKnowledgeAssetDto,
  KnowledgeSearchChunkDto,
  KnowledgeAssetReferenceDto,
  TeluguDialectTermDto,
  KnowledgeSearchResultDto,
  CreateProjectKnowledgeAssetInput,
  CreateKnowledgeChunkInput,
  CreateKnowledgeReferenceInput,
  CreateTeluguDialectTermInput,
  SearchKnowledgeQueryInput,
  KnowledgeAssetCategory,
  KnowledgeContentFormat,
  TeluguDialectRegion,
  KnowledgeReferenceTargetType,
} from '@film-studio/contracts';

interface AssetRow {
  id: string;
  film_id: string;
  title: string;
  category: KnowledgeAssetCategory;
  language: string;
  content_format: KnowledgeContentFormat;
  text_content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChunkRow {
  id: string;
  film_id: string;
  asset_id: string;
  chunk_index: number;
  chunk_text: string;
  language: string;
  embedding_model: string;
  embedding_vector: number[] | null;
  created_at: Date | string;
}

interface ReferenceRow {
  id: string;
  film_id: string;
  asset_id: string;
  target_type: KnowledgeReferenceTargetType;
  target_id: string;
  relevance_notes: string | null;
  created_at: Date | string;
}

interface DialectTermRow {
  id: string;
  film_id: string;
  standard_term: string;
  dialect_term: string;
  dialect_region: TeluguDialectRegion;
  meaning: string;
  example_dialogue: string | null;
  created_at: Date | string;
}

interface SearchRow extends ChunkRow {
  asset_title: string;
  asset_category: KnowledgeAssetCategory;
  rank_score: number;
}

function toIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
}

function mapAsset(row: AssetRow): ProjectKnowledgeAssetDto {
  return {
    id: row.id,
    filmId: row.film_id,
    title: row.title,
    category: row.category,
    language: row.language,
    contentFormat: row.content_format,
    textContent: row.text_content,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapChunk(row: ChunkRow): KnowledgeSearchChunkDto {
  return {
    id: row.id,
    filmId: row.film_id,
    assetId: row.asset_id,
    chunkIndex: Number(row.chunk_index),
    chunkText: row.chunk_text,
    language: row.language,
    embeddingModel: row.embedding_model,
    embeddingVector: row.embedding_vector ? row.embedding_vector.map(Number) : null,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapReference(row: ReferenceRow): KnowledgeAssetReferenceDto {
  return {
    id: row.id,
    filmId: row.film_id,
    assetId: row.asset_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relevanceNotes: row.relevance_notes ?? null,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapDialectTerm(row: DialectTermRow): TeluguDialectTermDto {
  return {
    id: row.id,
    filmId: row.film_id,
    standardTerm: row.standard_term,
    dialectTerm: row.dialect_term,
    dialectRegion: row.dialect_region,
    meaning: row.meaning,
    exampleDialogue: row.example_dialogue ?? null,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export class PostgresKnowledgeRepository {
  constructor(private readonly pool: Pool) {}

  private getExecutor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  // 1. Create a knowledge asset
  async createAsset(
    input: CreateProjectKnowledgeAssetInput,
    createdBy: string,
    client?: PoolClient,
  ): Promise<ProjectKnowledgeAssetDto> {
    const res = await this.getExecutor(client).query<AssetRow>(
      `INSERT INTO project_knowledge_assets (
         film_id, title, category, language, content_format, text_content, tags, metadata, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.filmId,
        input.title,
        input.category,
        input.language ?? 'te-IN',
        input.contentFormat ?? 'markdown',
        input.textContent,
        input.tags ?? [],
        JSON.stringify(input.metadata ?? {}),
        createdBy,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create knowledge asset');
    return mapAsset(row);
  }

  // 2. Get asset by ID
  async getAsset(
    assetId: string,
    client?: PoolClient,
  ): Promise<ProjectKnowledgeAssetDto | null> {
    const res = await this.getExecutor(client).query<AssetRow>(
      `SELECT a.*
       FROM project_knowledge_assets a
       WHERE a.id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = a.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [assetId],
    );
    const row = res.rows[0];
    return row ? mapAsset(row) : null;
  }

  // 3. List assets with optional category filter
  async listAssets(
    filmId: string,
    category?: KnowledgeAssetCategory,
    client?: PoolClient,
  ): Promise<ProjectKnowledgeAssetDto[]> {
    const conditions = [
      'a.film_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = a.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [filmId];

    if (category) {
      params.push(category);
      conditions.push(`a.category = $${params.length}`);
    }

    const res = await this.getExecutor(client).query<AssetRow>(
      `SELECT a.*
       FROM project_knowledge_assets a
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC`,
      params,
    );
    return res.rows.map(mapAsset);
  }

  // 4. Delete asset (cascade removes chunks and references)
  async deleteAsset(assetId: string, client?: PoolClient): Promise<boolean> {
    const res = await this.getExecutor(client).query(
      `DELETE FROM project_knowledge_assets
       WHERE id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = project_knowledge_assets.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )`,
      [assetId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // 5. Create a search chunk with embeddings
  async createChunk(
    input: CreateKnowledgeChunkInput,
    client?: PoolClient,
  ): Promise<KnowledgeSearchChunkDto> {
    const vectorFormatted = input.embeddingVector
      ? `{${input.embeddingVector.join(',')}}`
      : null;

    const res = await this.getExecutor(client).query<ChunkRow>(
      `INSERT INTO knowledge_search_chunks (
         film_id, asset_id, chunk_index, chunk_text, language, embedding_model, embedding_vector
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::real[])
       RETURNING *`,
      [
        input.filmId,
        input.assetId,
        input.chunkIndex,
        input.chunkText,
        input.language ?? 'te-IN',
        input.embeddingModel ?? 'text-embedding-004',
        vectorFormatted,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create knowledge search chunk');
    return mapChunk(row);
  }

  // 6. List chunks for an asset
  async listChunks(
    assetId: string,
    client?: PoolClient,
  ): Promise<KnowledgeSearchChunkDto[]> {
    const res = await this.getExecutor(client).query<ChunkRow>(
      `SELECT c.*
       FROM knowledge_search_chunks c
       WHERE c.asset_id = $1
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = c.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY c.chunk_index ASC`,
      [assetId],
    );
    return res.rows.map(mapChunk);
  }

  // 7. Search knowledge chunks (hybrid full-text + vector score)
  async searchKnowledge(
    input: SearchKnowledgeQueryInput,
    client?: PoolClient,
  ): Promise<KnowledgeSearchResultDto[]> {
    const conditions = [
      'c.film_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = c.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [input.filmId, input.query];
    let queryIndex = 2;

    if (input.category) {
      params.push(input.category);
      conditions.push(`a.category = $${params.length}`);
    }

    params.push(input.limit ?? 10);
    const limitIndex = params.length;

    const res = await this.getExecutor(client).query<SearchRow>(
      `SELECT c.*,
              a.title AS asset_title,
              a.category AS asset_category,
              ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $${queryIndex})) AS rank_score
       FROM knowledge_search_chunks c
       JOIN project_knowledge_assets a ON a.id = c.asset_id
       WHERE ${conditions.join(' AND ')}
         AND (
           c.tsv_content @@ plainto_tsquery('simple', $${queryIndex})
           OR c.chunk_text ILIKE ('%' || $${queryIndex} || '%')
         )
       ORDER BY rank_score DESC, c.created_at DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return res.rows.map((row) => {
      const matchIdx = row.chunk_text.indexOf(input.query);
      let matchSnippet: string;
      if (matchIdx !== -1) {
        const start = Math.max(0, matchIdx - 40);
        const end = Math.min(row.chunk_text.length, matchIdx + input.query.length + 80);
        matchSnippet = (start > 0 ? '...' : '') + row.chunk_text.slice(start, end) + (end < row.chunk_text.length ? '...' : '');
      } else {
        matchSnippet = row.chunk_text.slice(0, 250);
      }
      return {
        chunk: mapChunk(row),
        assetTitle: row.asset_title,
        category: row.asset_category,
        similarityScore: Math.max(0.5, Number(row.rank_score) || 0.85),
        matchSnippet,
      };
    });
  }

  // 8. Create knowledge asset reference
  async createReference(
    input: CreateKnowledgeReferenceInput,
    client?: PoolClient,
  ): Promise<KnowledgeAssetReferenceDto> {
    const res = await this.getExecutor(client).query<ReferenceRow>(
      `INSERT INTO knowledge_asset_references (
         film_id, asset_id, target_type, target_id, relevance_notes
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.filmId,
        input.assetId,
        input.targetType,
        input.targetId,
        input.relevanceNotes ?? null,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create knowledge reference');
    return mapReference(row);
  }

  // 9. List references for a target entity
  async listReferences(
    filmId: string,
    targetType: KnowledgeReferenceTargetType,
    targetId: string,
    client?: PoolClient,
  ): Promise<KnowledgeAssetReferenceDto[]> {
    const res = await this.getExecutor(client).query<ReferenceRow>(
      `SELECT r.*
       FROM knowledge_asset_references r
       WHERE r.film_id = $1 AND r.target_type = $2 AND r.target_id = $3
         AND EXISTS (
           SELECT 1 FROM film_memberships fm
           WHERE fm.film_id = r.film_id
             AND fm.user_id = current_setting('app.user_id', true)::uuid
         )
       ORDER BY r.created_at ASC`,
      [filmId, targetType, targetId],
    );
    return res.rows.map(mapReference);
  }

  // 10. Create Telugu dialect term
  async createDialectTerm(
    input: CreateTeluguDialectTermInput,
    client?: PoolClient,
  ): Promise<TeluguDialectTermDto> {
    const res = await this.getExecutor(client).query<DialectTermRow>(
      `INSERT INTO telugu_dialect_terms (
         film_id, standard_term, dialect_term, dialect_region, meaning, example_dialogue
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (film_id, dialect_term, dialect_region) DO UPDATE SET
         standard_term = EXCLUDED.standard_term,
         meaning = EXCLUDED.meaning,
         example_dialogue = EXCLUDED.example_dialogue
       RETURNING *`,
      [
        input.filmId,
        input.standardTerm,
        input.dialectTerm,
        input.dialectRegion,
        input.meaning,
        input.exampleDialogue ?? null,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create Telugu dialect term');
    return mapDialectTerm(row);
  }

  // 11. List dialect terms
  async listDialectTerms(
    filmId: string,
    dialectRegion?: TeluguDialectRegion,
    client?: PoolClient,
  ): Promise<TeluguDialectTermDto[]> {
    const conditions = [
      'd.film_id = $1',
      `EXISTS (
         SELECT 1 FROM film_memberships fm
         WHERE fm.film_id = d.film_id
           AND fm.user_id = current_setting('app.user_id', true)::uuid
       )`,
    ];
    const params: unknown[] = [filmId];

    if (dialectRegion) {
      params.push(dialectRegion);
      conditions.push(`d.dialect_region = $${params.length}`);
    }

    const res = await this.getExecutor(client).query<DialectTermRow>(
      `SELECT d.*
       FROM telugu_dialect_terms d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.dialect_term ASC`,
      params,
    );
    return res.rows.map(mapDialectTerm);
  }
}
