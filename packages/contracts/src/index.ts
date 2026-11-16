import { z } from 'zod';
import { screenplayDocumentSchema } from '@film-studio/screenplay-model';

export const appEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (val) => val.startsWith('postgresql://') || val.startsWith('postgres://'),
        { message: 'Must start with postgresql:// or postgres://' },
      ),
    REDIS_URL: z
      .string()
      .url()
      .refine(
        (val) => val.startsWith('redis://') || val.startsWith('rediss://'),
        { message: 'Must start with redis:// or rediss://' },
      ),
    OBJECT_STORAGE_ENDPOINT: z.string().url(),
    OBJECT_STORAGE_REGION: z.string().min(1),
    OBJECT_STORAGE_BUCKET: z.string().min(3),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(16),
    ALLOWED_ORIGINS: z
      .string()
      .transform((value) => value.split(/\s+/u).filter(Boolean))
      .pipe(z.array(z.string().url()).min(1)),
    OIDC_ISSUER_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(16).optional(),
    OIDC_WEB_REDIRECT_URI: z.string().url().optional(),
    OIDC_ANDROID_REDIRECT_URI: z.string().url().optional(),
    OIDC_IOS_REDIRECT_URI: z.string().url().optional(),
    WEB_APP_URL: z.string().url().optional(),
    AUTH_TRANSACTION_ENCRYPTION_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/u)
      .optional(),
    SESSION_COOKIE_SECURE: z.stringbool().default(false),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(900)
      .default(300),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(7_776_000)
      .default(2_592_000),
  })
  .superRefine((environment, context) => {
    if (
      environment.APP_ENV === 'staging' ||
      environment.APP_ENV === 'production'
    ) {
      for (const key of [
        'OIDC_ISSUER_URL',
        'OIDC_CLIENT_ID',
        'OIDC_WEB_REDIRECT_URI',
        'OIDC_ANDROID_REDIRECT_URI',
        'OIDC_IOS_REDIRECT_URI',
        'WEB_APP_URL',
        'AUTH_TRANSACTION_ENCRYPTION_KEY',
      ] as const) {
        if (environment[key] === undefined) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required outside local/test environments.`,
            path: [key],
          });
        }
      }
      if (!environment.SESSION_COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          message:
            'SESSION_COOKIE_SECURE must be true outside local/test environments.',
          path: ['SESSION_COOKIE_SECURE'],
        });
      }
    }
  });

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export function parseAppEnvironment(
  input: Record<string, string | undefined>,
): AppEnvironment {
  return appEnvironmentSchema.parse(input);
}

export const serviceStatusSchema = z.object({
  service: z.enum(['api', 'worker']),
  status: z.literal('ok'),
  version: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const errorEnvelopeSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/u),
  message: z.string().min(1),
  requestId: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const authenticatedPrincipalSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
  authenticationTime: z.string().datetime(),
});

export type AuthenticatedPrincipal = z.infer<
  typeof authenticatedPrincipalSchema
>;

export const sessionTokenPairSchema = z.object({
  accessToken: z.string().min(32),
  accessTokenExpiresAt: z.string().datetime(),
  refreshToken: z.string().min(32),
  refreshTokenExpiresAt: z.string().datetime(),
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

export type SessionTokenPair = z.infer<typeof sessionTokenPairSchema>;

export const refreshSessionRequestSchema = z.object({
  refreshToken: z.string().min(32),
});

export const revokeSessionRequestSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum([
    'user_logout',
    'user_revoke',
    'admin_security',
    'replay_detected',
  ]),
});

export const filmAuthorizationContextSchema = z.object({
  filmId: z.string().uuid(),
  permission: z.string().regex(/^[a-z][a-z0-9_.-]+$/u),
});

export type FilmAuthorizationContext = z.infer<
  typeof filmAuthorizationContextSchema
>;

export const auditEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actorUserId: z.string().uuid().optional(),
  actorSessionId: z.string().uuid().optional(),
  filmId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  action: z.string().regex(/^[a-z][a-z0-9_.-]+$/u),
  outcome: z.enum(['success', 'denied', 'failed']),
  targetType: z.string().max(100).optional(),
  targetId: z.string().uuid().optional(),
  requestId: z.string().min(8).max(128),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
});

export type AuditEventEnvelope = z.infer<typeof auditEventEnvelopeSchema>;

export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export const filmStatusSchema = z.enum([
  'active',
  'archived',
  'deletion_requested',
  'deleted',
]);
export type FilmStatus = z.infer<typeof filmStatusSchema>;

export const filmResourceSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  status: filmStatusSchema,
  permissionRevision: z.string().optional(),
});
export type FilmResource = z.infer<typeof filmResourceSchema>;

export const createFilmRequestSchema = z.object({
  title: z.string().trim().min(1).max(240),
});

export const createFilmInvitationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  roleIds: z.array(z.string().uuid()).max(20),
  expiresAt: z.string().datetime(),
});

export const acceptFilmInvitationRequestSchema = z.object({
  token: z.string().min(32).max(256),
});

export const documentKindSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u);

export const languageTagSchema = z
  .string()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u);

export const createDocumentRequestSchema = z.object({
  operationId: z.string().uuid(),
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  kind: documentKindSchema,
  language: languageTagSchema,
});

export const updateDocumentRequestSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(240).optional(),
    kind: documentKindSchema.optional(),
    language: languageTagSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.kind !== undefined ||
      input.language !== undefined ||
      input.archived !== undefined,
    'At least one document change is required.',
  );

export const documentResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string(),
  kind: documentKindSchema,
  language: languageTagSchema,
  version: z.number().int().positive(),
  archivedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});

export const createSceneRequestSchema = z.object({
  operationId: z.string().uuid(),
  id: z.string().uuid(),
  expectedDocumentVersion: z.number().int().positive(),
  targetIndex: z.number().int().nonnegative(),
});

export const moveSceneRequestSchema = z.object({
  operationId: z.string().uuid(),
  expectedDocumentVersion: z.number().int().positive(),
  expectedSceneVersion: z.number().int().positive(),
  targetIndex: z.number().int().nonnegative(),
});

export const deleteSceneRequestSchema = z.object({
  operationId: z.string().uuid(),
  expectedDocumentVersion: z.number().int().positive(),
  expectedSceneVersion: z.number().int().positive(),
});

export const restoreSceneRequestSchema = moveSceneRequestSchema;

export const sceneResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  version: z.number().int().positive(),
  index: z.number().int().nonnegative().nullable(),
  deletedAt: z.string().datetime().nullable(),
});

export const createDocumentVersionRequestSchema = z.object({
  operationId: z.string().uuid(),
  id: z.string().uuid(),
  expectedDocumentVersion: z.number().int().positive(),
  snapshot: screenplayDocumentSchema,
});

export const documentVersionResourceSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const documentVersionSummaryResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
});

export const documentVersionDetailResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  snapshot: screenplayDocumentSchema,
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
});

export const restoreDocumentVersionRequestSchema = z.object({
  operationId: z.string().uuid(),
  expectedDocumentVersion: z.number().int().positive(),
});

export const importScriptRequestSchema = z.object({
  operationId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  format: z.enum(['fountain', 'text']),
  content: z.string().min(1),
  language: languageTagSchema.default('te-IN'),
});

export const importScriptResponseSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  sceneCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  totalLinesParsed: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      line: z.number(),
      rawText: z.string(),
      code: z.enum([
        'UNRECOGNIZED_ELEMENT',
        'MALFORMED_CHARACTER_CUE',
        'EMPTY_HEADING',
        'INDENTATION_ANOMALY',
      ]),
      message: z.string(),
      suggestedCorrection: z.string().optional(),
    }),
  ),
});

export type DocumentResource = z.infer<typeof documentResourceSchema>;
export type SceneResource = z.infer<typeof sceneResourceSchema>;
export type DocumentVersionSummaryResource = z.infer<
  typeof documentVersionSummaryResourceSchema
>;
export type DocumentVersionDetailResource = z.infer<
  typeof documentVersionDetailResourceSchema
>;
export type RestoreDocumentVersionRequest = z.infer<
  typeof restoreDocumentVersionRequestSchema
>;
export type ImportScriptRequest = z.infer<typeof importScriptRequestSchema>;
export type ImportScriptResponse = z.infer<typeof importScriptResponseSchema>;

export const clientOperationSchema = z.object({
  schemaVersion: z.literal(1),
  opId: z.string().uuid(),
  filmId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  deviceId: z.string().uuid(),
  clientSequence: z.number().int().nonnegative(),
  entityType: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u),
  entityId: z.string().uuid(),
  kind: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u),
  baseVersion: z.number().int().nonnegative().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAtClient: z.string().datetime(),
});

export type ClientOperationDto = z.infer<typeof clientOperationSchema>;

export const pushSyncOperationsRequestSchema = z.object({
  filmId: z.string().uuid(),
  operations: z.array(clientOperationSchema).min(1).max(100),
});

export type PushSyncOperationsRequest = z.infer<
  typeof pushSyncOperationsRequestSchema
>;

export const syncPushResultSchema = z.object({
  opId: z.string().uuid(),
  status: z.enum(['applied', 'already_applied', 'conflict', 'rejected']),
  serverRevision: z.number().int().positive().optional(),
  entityVersion: z.number().int().positive().optional(),
  conflictId: z.string().uuid().optional(),
  errorCode: z.string().optional(),
});

export type SyncPushResultDto = z.infer<typeof syncPushResultSchema>;

export const pushSyncOperationsResponseSchema = z.object({
  filmId: z.string().uuid(),
  results: z.array(syncPushResultSchema),
  latestServerRevision: z.number().int().nonnegative(),
});

export type PushSyncOperationsResponse = z.infer<
  typeof pushSyncOperationsResponseSchema
>;

export const pullSyncOperationsRequestSchema = z.object({
  filmId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type PullSyncOperationsRequest = z.infer<
  typeof pullSyncOperationsRequestSchema
>;

export const acceptedOperationSchema = clientOperationSchema.extend({
  serverRevision: z.number().int().positive(),
  recordedAt: z.string().datetime(),
});

export type AcceptedOperationDto = z.infer<typeof acceptedOperationSchema>;

export const pullSyncOperationsResponseSchema = z.object({
  kind: z.enum(['operations', 'snapshot_required']),
  operations: z.array(acceptedOperationSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
  latestServerRevision: z.number().int().nonnegative(),
  floorRevision: z.number().int().nonnegative().optional(),
});

export type PullSyncOperationsResponse = z.infer<
  typeof pullSyncOperationsResponseSchema
>;

export const acknowledgeSyncRevisionRequestSchema = z.object({
  filmId: z.string().uuid(),
  deviceId: z.string().uuid(),
  serverRevision: z.number().int().nonnegative(),
});

export type AcknowledgeSyncRevisionRequest = z.infer<
  typeof acknowledgeSyncRevisionRequestSchema
>;

export const syncConflictSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  operationId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  deviceId: z.string().uuid(),
  conflictType: z.enum([
    'SAME_FIELD_CHANGED',
    'DELETE_VS_EDIT',
    'FUTURE_BASE_VERSION',
    'CONCURRENT_CONFLICT',
  ]),
  entityType: z.string(),
  entityId: z.string().uuid(),
  baseVersion: z.number().int().nonnegative().nullable(),
  serverVersion: z.number().int().nonnegative(),
  clientPayload: z.record(z.string(), z.unknown()),
  serverPayload: z.record(z.string(), z.unknown()),
  recoveryBranchId: z.string().uuid().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  resolvedBy: z.string().uuid().nullable().optional(),
  resolutionStrategy: z
    .enum(['keep_local', 'keep_remote', 'merge', 'save_alternative'])
    .nullable()
    .optional(),
  createdAt: z.string().datetime(),
});

export type SyncConflictDto = z.infer<typeof syncConflictSchema>;

export const resolveConflictRequestSchema = z.object({
  choice: z.enum(['keep_local', 'keep_remote', 'merge', 'save_alternative']),
  mergedPayload: z.record(z.string(), z.unknown()).optional(),
});

export type ResolveConflictRequest = z.infer<
  typeof resolveConflictRequestSchema
>;

export const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const requestUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.number().int().positive().max(104857600), // 100 MB max per file
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type RequestUploadUrlDto = z.infer<typeof requestUploadUrlSchema>;

export const uploadUrlResponseSchema = z.object({
  fileId: z.string().uuid(),
  storageKey: z.string().min(1),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export type UploadUrlResponseDto = z.infer<typeof uploadUrlResponseSchema>;

export const fileResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum([
    'pending',
    'uploaded',
    'scanning',
    'ready',
    'quarantined',
    'deleted',
  ]),
  downloadUrl: z.string().url().optional(),
  quarantineReason: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type FileResourceDto = z.infer<typeof fileResourceSchema>;

export const backgroundQueueNames = [
  'exports',
  'imports',
  'notifications',
  'ai-proposals',
] as const;

export const createBackgroundJobSchema = z.object({
  queueName: z.enum(backgroundQueueNames),
  jobType: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u),
  idempotencyKey: z.string().min(1).max(128).optional(),
  payload: z.record(z.string(), z.unknown()),
  maxAttempts: z.number().int().min(1).max(10).default(3),
});

export type CreateBackgroundJobDto = z.infer<typeof createBackgroundJobSchema>;

export const backgroundJobResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  queueName: z.enum(backgroundQueueNames),
  jobType: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'dead_letter']),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BackgroundJobResourceDto = z.infer<
  typeof backgroundJobResourceSchema
>;

export const readinessStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  database: z.boolean(),
  redis: z.boolean(),
  timestamp: z.string().datetime(),
});

export type ReadinessStatusDto = z.infer<typeof readinessStatusSchema>;

// --- SPRINT 11: Characters, Scene Board, Unicode-Aware Search ---

export const characterRelationshipSchema = z.object({
  sourceCharacterId: z.string().uuid(),
  targetCharacterId: z.string().uuid(),
  relationshipType: z.string().min(1).max(100),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CharacterRelationshipDto = z.infer<typeof characterRelationshipSchema>;

export const characterResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  displayName: z.string().min(1).max(240),
  aliases: z.array(z.string()),
  profile: z.record(z.string(), z.unknown()),
  voiceTraits: z.record(z.string(), z.unknown()),
  arcSummary: z.string().nullable().optional(),
  version: z.number().int().positive(),
  totalScenes: z.number().int().nonnegative().optional(),
  totalDialogueBlocks: z.number().int().nonnegative().optional(),
  totalDialogueWords: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CharacterResourceDto = z.infer<typeof characterResourceSchema>;

export const createCharacterSchema = z.object({
  displayName: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).default([]),
  profile: z.record(z.string(), z.unknown()).default({}),
  voiceTraits: z.record(z.string(), z.unknown()).default({}),
  arcSummary: z.string().max(5000).optional(),
});

export type CreateCharacterDto = z.infer<typeof createCharacterSchema>;

export const updateCharacterSchema = createCharacterSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
});

export type UpdateCharacterDto = z.infer<typeof updateCharacterSchema>;

export const sceneCardResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  slugline: z.string().nullable().optional(),
  timeOfDay: z.string().nullable().optional(),
  settingLocation: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  isLocked: z.boolean(),
  lockedBy: z.string().uuid().nullable().optional(),
  lockedAt: z.string().datetime().nullable().optional(),
  version: z.number().int().positive(),
  characters: z.array(
    z.object({
      characterId: z.string().uuid(),
      displayName: z.string(),
      dialogueBlockCount: z.number().int().nonnegative(),
      dialogueWordCount: z.number().int().nonnegative(),
    }),
  ),
  wordCount: z.number().int().nonnegative(),
});

export type SceneCardResourceDto = z.infer<typeof sceneCardResourceSchema>;

export const reorderScenesSchema = z.object({
  documentId: z.string().uuid(),
  sceneIdsInOrder: z.array(z.string().uuid()).min(1),
});

export type ReorderScenesDto = z.infer<typeof reorderScenesSchema>;

export const lockSceneSchema = z.object({
  lock: z.boolean(),
});

export type LockSceneDto = z.infer<typeof lockSceneSchema>;

export const searchItemType = z.enum([
  'character',
  'scene',
  'dialogue',
  'action',
  'document',
]);

export type SearchItemType = z.infer<typeof searchItemType>;

export const searchResultItemSchema = z.object({
  type: searchItemType,
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string(),
  snippet: z.string(),
  documentId: z.string().uuid().optional(),
  sceneId: z.string().uuid().optional(),
  score: z.number().optional(),
});

export type SearchResultItemDto = z.infer<typeof searchResultItemSchema>;

export const globalSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type GlobalSearchResponseDto = z.infer<typeof globalSearchResponseSchema>;

// Sprint 22: Story Development Studio Contracts
export const narrativeStructureTypeSchema = z.enum([
  'three_act',
  'hero_journey',
  'save_the_cat',
  'dan_harmon_circle',
  'seven_point',
  'freytag_pyramid',
  'custom',
]);

export type NarrativeStructureType = z.infer<typeof narrativeStructureTypeSchema>;

export const storyBibleSchema = z.object({
  filmId: z.string().uuid(),
  premise: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  dramaticQuestion: z.string().nullable().optional(),
  narrativeStructure: narrativeStructureTypeSchema.default('three_act'),
  logline: z.string().nullable().optional(),
  shortSynopsis: z.string().nullable().optional(),
  longSynopsis: z.string().nullable().optional(),
  treatment: z.string().nullable().optional(),
  worldBuildingRules: z.record(z.string(), z.unknown()).default({}),
  historicalContext: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type StoryBibleDto = z.infer<typeof storyBibleSchema>;

export const updateStoryBibleSchema = storyBibleSchema.omit({ filmId: true, createdAt: true, updatedAt: true }).partial();
export type UpdateStoryBibleDto = z.infer<typeof updateStoryBibleSchema>;

export const storyThreadTypeSchema = z.enum([
  'plot',
  'theme',
  'character_arc',
  'relationship',
  'mystery',
]);

export type StoryThreadType = z.infer<typeof storyThreadTypeSchema>;

export const storyThreadSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string().min(1).max(255),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  threadType: storyThreadTypeSchema.default('plot'),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type StoryThreadDto = z.infer<typeof storyThreadSchema>;

export const createStoryThreadSchema = storyThreadSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({ sortOrder: true });
export type CreateStoryThreadDto = z.infer<typeof createStoryThreadSchema>;

export const storyBeatSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  act: z.number().int().min(1).max(5).default(1),
  title: z.string().min(1).max(255),
  beatType: z.string().default('beat'),
  timingMinute: z.number().int().min(0).nullable().optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().min(1),
  linkedSceneId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type StoryBeatDto = z.infer<typeof storyBeatSchema>;

export const createStoryBeatSchema = storyBeatSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({ sortOrder: true, act: true, beatType: true });
export type CreateStoryBeatDto = z.infer<typeof createStoryBeatSchema>;

export const storyDevelopmentOverviewSchema = z.object({
  bible: storyBibleSchema.nullable(),
  threads: z.array(storyThreadSchema),
  beats: z.array(storyBeatSchema),
});

export type StoryDevelopmentOverviewDto = z.infer<typeof storyDevelopmentOverviewSchema>;

// Sprint 23: Character, Scene, and Sequence Intelligence Contracts
export const sequenceResourceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  title: z.string().min(1).max(255),
  dramaticPurpose: z.string().nullable().optional(),
  act: z.number().int().min(1).max(5).default(1),
  sortOrder: z.number().int().min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type SequenceResourceDto = z.infer<typeof sequenceResourceSchema>;

export const createSequenceSchema = sequenceResourceSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({ sortOrder: true, act: true });
export type CreateSequenceDto = z.infer<typeof createSequenceSchema>;

export const characterArcSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  characterId: z.string().uuid(),
  startingState: z.string().nullable().optional(),
  transformationCatalyst: z.string().nullable().optional(),
  climaxChoice: z.string().nullable().optional(),
  resolutionState: z.string().nullable().optional(),
  flaw: z.string().nullable().optional(),
  internalNeed: z.string().nullable().optional(),
  externalGoal: z.string().nullable().optional(),
  dialectProfile: z.string().nullable().optional(),
  voiceRhythm: z.string().nullable().optional(),
  vocabularyNotes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type CharacterArcDto = z.infer<typeof characterArcSchema>;

export const upsertCharacterArcSchema = characterArcSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type UpsertCharacterArcDto = z.infer<typeof upsertCharacterArcSchema>;

export const emotionalPolaritySchema = z.enum([
  'positive',
  'negative',
  'neutral',
  'ambivalent',
  'shift_pos_to_neg',
  'shift_neg_to_pos',
]);

export type EmotionalPolarity = z.infer<typeof emotionalPolaritySchema>;

export const sceneIntelligenceSchema = z.object({
  sceneId: z.string().uuid(),
  sequenceId: z.string().uuid().nullable().optional(),
  dramaticPurpose: z.string().nullable().optional(),
  tone: z.string().nullable().optional(),
  emotionalPolarity: emotionalPolaritySchema.nullable().optional(),
  sceneStatus: z.enum(['idea', 'outline', 'draft', 'revised', 'locked']).default('draft'),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
});

export type SceneIntelligenceDto = z.infer<typeof sceneIntelligenceSchema>;

export const screenplayPacingReportSchema = z.object({
  filmId: z.string().uuid(),
  totalScenes: z.number().int().nonnegative(),
  totalSequences: z.number().int().nonnegative(),
  actBreakdown: z.record(z.string(), z.object({
    sceneCount: z.number().int().nonnegative(),
    estimatedMinutes: z.number().nonnegative(),
    sequences: z.array(z.string()),
  })),
  characterDialogueShare: z.array(z.object({
    characterId: z.string().uuid(),
    displayName: z.string(),
    dialogueWords: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
  })),
});

export type ScreenplayPacingReportDto = z.infer<typeof screenplayPacingReportSchema>;

// Sprint 24: Continuity and Revision Control
export const continuityEntityTypeSchema = z.enum([
  'character',
  'location',
  'prop',
  'time',
  'world_rule',
]);
export type ContinuityEntityType = z.infer<typeof continuityEntityTypeSchema>;

export const continuityFactSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  entityType: continuityEntityTypeSchema,
  entityId: z.string().uuid().nullable().optional(),
  attributeKey: z.string().min(1).max(120),
  canonicalValue: z.string().min(1),
  evidenceSceneId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContinuityFactDto = z.infer<typeof continuityFactSchema>;

export const createContinuityFactSchema = z.object({
  filmId: z.string().uuid(),
  entityType: continuityEntityTypeSchema,
  entityId: z.string().uuid().nullable().optional(),
  attributeKey: z.string().min(1).max(120),
  canonicalValue: z.string().min(1),
  evidenceSceneId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateContinuityFactDto = z.infer<typeof createContinuityFactSchema>;

export const continuityIssueSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type ContinuityIssueSeverity = z.infer<typeof continuityIssueSeveritySchema>;

export const continuityIssueStatusSchema = z.enum([
  'potential',
  'confirmed',
  'intentional_exception',
  'resolved',
]);
export type ContinuityIssueStatus = z.infer<typeof continuityIssueStatusSchema>;

export const continuityIssueSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  factId: z.string().uuid().nullable().optional(),
  sceneId: z.string().uuid(),
  ruleCode: z.string().min(1).max(100),
  severity: continuityIssueSeveritySchema,
  status: continuityIssueStatusSchema,
  explanation: z.string().min(1),
  resolutionNotes: z.string().nullable().optional(),
  resolvedBy: z.string().uuid().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContinuityIssueDto = z.infer<typeof continuityIssueSchema>;

export const createContinuityIssueSchema = z.object({
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  factId: z.string().uuid().nullable().optional(),
  sceneId: z.string().uuid(),
  ruleCode: z.string().min(1).max(100),
  severity: continuityIssueSeveritySchema,
  status: continuityIssueStatusSchema.default('potential'),
  explanation: z.string().min(1),
});
export type CreateContinuityIssueDto = z.infer<typeof createContinuityIssueSchema>;

export const resolveContinuityIssueSchema = z.object({
  status: z.enum(['confirmed', 'intentional_exception', 'resolved']),
  resolutionNotes: z.string().optional(),
  resolvedBy: z.string().uuid(),
});
export type ResolveContinuityIssueDto = z.infer<typeof resolveContinuityIssueSchema>;

export const revisionColorSchema = z.enum([
  'white',
  'blue',
  'pink',
  'yellow',
  'green',
  'goldenrod',
  'buff',
  'salmon',
  'cherry',
  'second_white',
  'second_blue',
]);
export type RevisionColor = z.infer<typeof revisionColorSchema>;

export const productionRevisionSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  revisionNumber: z.number().int().min(1),
  color: revisionColorSchema,
  title: z.string().min(1).max(255),
  isLocked: z.boolean(),
  lockedAt: z.string().nullable().optional(),
  lockedBy: z.string().uuid().nullable().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductionRevisionDto = z.infer<typeof productionRevisionSchema>;

export const createProductionRevisionSchema = z.object({
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  revisionNumber: z.number().int().min(1).optional(),
  color: revisionColorSchema,
  title: z.string().min(1).max(255),
  createdBy: z.string().uuid(),
});
export type CreateProductionRevisionDto = z.infer<typeof createProductionRevisionSchema>;

export const revisionApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type RevisionApprovalStatus = z.infer<typeof revisionApprovalStatusSchema>;

export const revisionApprovalSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  revisionId: z.string().uuid(),
  approverId: z.string().uuid(),
  status: revisionApprovalStatusSchema,
  comments: z.string().nullable().optional(),
  decisionAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type RevisionApprovalDto = z.infer<typeof revisionApprovalSchema>;

// Sprint 25: AI Provider Gateway and Secret Controls
export const aiProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'gemini',
  'openai_compatible',
  'local',
]);
export type AiProviderType = z.infer<typeof aiProviderTypeSchema>;

export const aiOperationKindSchema = z.enum([
  'analysis',
  'proposal',
  'character_arc',
  'coverage',
  'pitch',
  'continuity_check',
]);
export type AiOperationKind = z.infer<typeof aiOperationKindSchema>;

export const aiProviderConfigSummarySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().nullable().optional(),
  provider: aiProviderTypeSchema,
  modelName: z.string().min(1).max(120),
  maskedApiKey: z.string(),
  endpointUrl: z.string().nullable().optional(),
  isActive: z.boolean(),
  dailySpendLimitCents: z.number().int().nonnegative(),
  rateLimitRpm: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiProviderConfigSummaryDto = z.infer<typeof aiProviderConfigSummarySchema>;

export const createAiProviderConfigSchema = z.object({
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().optional(),
  provider: aiProviderTypeSchema,
  modelName: z.string().min(1).max(120),
  apiKey: z.string().min(1),
  endpointUrl: z.string().url().optional(),
  dailySpendLimitCents: z.number().int().nonnegative().default(10000),
  rateLimitRpm: z.number().int().positive().default(60),
  timeoutMs: z.number().int().positive().default(60000),
});
export type CreateAiProviderConfigDto = z.infer<typeof createAiProviderConfigSchema>;

export const recordAiUsageSchema = z.object({
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().optional(),
  configId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative().default(0),
  operationKind: aiOperationKindSchema,
  requestHash: z.string().length(64),
});
export type RecordAiUsageDto = z.infer<typeof recordAiUsageSchema>;

export const aiSpendSummarySchema = z.object({
  organizationId: z.string().uuid(),
  totalSpentTodayCents: z.number().int().nonnegative(),
  dailyLimitCents: z.number().int().nonnegative(),
  isLimitExceeded: z.boolean(),
  recentRequestsCount: z.number().int().nonnegative(),
});
export type AiSpendSummaryDto = z.infer<typeof aiSpendSummarySchema>;

// ── Sprint 26: AI Proposal Workflow ──────────────────────────────

export const aiManifestOperationKindSchema = z.enum([
  'rewrite',
  'dialogue_polish',
  'scene_expansion',
  'character_voice',
  'continuity_check',
  'coverage_analysis',
  'translation',
  'pitch_draft',
]);
export type AiManifestOperationKind = z.infer<typeof aiManifestOperationKindSchema>;

export const aiManifestStatusSchema = z.enum([
  'draft',
  'consent_pending',
  'consented',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type AiManifestStatus = z.infer<typeof aiManifestStatusSchema>;

export const aiContentManifestSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  configId: z.string().uuid(),
  createdBy: z.string().uuid(),
  documentVersion: z.number().int().min(1),
  selectedSceneIds: z.array(z.string().uuid()),
  selectedCharacterIds: z.array(z.string().uuid()),
  contextSummaryHash: z.string().length(64),
  operationKind: aiManifestOperationKindSchema,
  language: z.string().min(2).default('te-IN'),
  consentGranted: z.boolean(),
  consentGrantedAt: z.string().datetime().nullable(),
  status: aiManifestStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiContentManifestDto = z.infer<typeof aiContentManifestSchema>;

export const createAiContentManifestSchema = z.object({
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  configId: z.string().uuid(),
  documentVersion: z.number().int().min(1),
  selectedSceneIds: z.array(z.string().uuid()).default([]),
  selectedCharacterIds: z.array(z.string().uuid()).default([]),
  contextSummaryHash: z.string().length(64),
  operationKind: aiManifestOperationKindSchema,
  language: z.string().min(2).default('te-IN'),
});
export type CreateAiContentManifestDto = z.infer<typeof createAiContentManifestSchema>;

export const aiProposalContentTypeSchema = z.enum([
  'scene_block',
  'dialogue',
  'action_line',
  'character_note',
  'report',
  'pitch_section',
]);
export type AiProposalContentType = z.infer<typeof aiProposalContentTypeSchema>;

export const aiProposalDecisionSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'edited',
]);
export type AiProposalDecision = z.infer<typeof aiProposalDecisionSchema>;

export const aiProposalSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  manifestId: z.string().uuid(),
  proposalIndex: z.number().int().min(1),
  contentType: aiProposalContentTypeSchema,
  originalText: z.string(),
  proposedText: z.string(),
  targetSceneId: z.string().uuid().nullable(),
  targetCharacterId: z.string().uuid().nullable(),
  rationale: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  decision: aiProposalDecisionSchema,
  editedText: z.string().nullable(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiProposalDto = z.infer<typeof aiProposalSchema>;

export const createAiProposalSchema = z.object({
  filmId: z.string().uuid(),
  manifestId: z.string().uuid(),
  contentType: aiProposalContentTypeSchema,
  originalText: z.string(),
  proposedText: z.string(),
  targetSceneId: z.string().uuid().optional(),
  targetCharacterId: z.string().uuid().optional(),
  rationale: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
});
export type CreateAiProposalDto = z.infer<typeof createAiProposalSchema>;

export const decideAiProposalSchema = z.object({
  decision: z.enum(['accepted', 'rejected', 'edited']),
  editedText: z.string().optional(),
});
export type DecideAiProposalDto = z.infer<typeof decideAiProposalSchema>;

export const aiManifestSummarySchema = z.object({
  id: z.string().uuid(),
  operationKind: aiManifestOperationKindSchema,
  status: aiManifestStatusSchema,
  consentGranted: z.boolean(),
  totalProposals: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  editedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
});
export type AiManifestSummaryDto = z.infer<typeof aiManifestSummarySchema>;

// ── Sprint 27: AI Film Development and Pitches ───────────────────

export const aiCoverageRecommendationSchema = z.enum(['pass', 'consider', 'recommend']);
export type AiCoverageRecommendation = z.infer<typeof aiCoverageRecommendationSchema>;

export const aiHarmEvalStatusSchema = z.enum(['passed', 'flagged', 'waived']);
export type AiHarmEvalStatus = z.infer<typeof aiHarmEvalStatusSchema>;

export const aiHumanReviewStatusSchema = z.enum(['unreviewed', 'accepted', 'amended', 'rejected']);
export type AiHumanReviewStatus = z.infer<typeof aiHumanReviewStatusSchema>;

export const aiBudgetTierSchema = z.enum(['micro', 'low', 'mid', 'high', 'tentpole']);
export type AiBudgetTier = z.infer<typeof aiBudgetTierSchema>;

export const aiPitchReviewStatusSchema = z.enum(['draft', 'reviewed', 'director_approved', 'producer_ready']);
export type AiPitchReviewStatus = z.infer<typeof aiPitchReviewStatusSchema>;

export const aiSceneCitationSchema = z.object({
  sceneId: z.string().uuid(),
  slugline: z.string(),
  note: z.string(),
  citationType: z.string().default('pacing'),
});
export type AiSceneCitation = z.infer<typeof aiSceneCitationSchema>;

export const aiModelProvenanceSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  configId: z.string().uuid().optional(),
  promptVersion: z.string().default('v1'),
  generatedAt: z.string().datetime(),
});
export type AiModelProvenance = z.infer<typeof aiModelProvenanceSchema>;

export const aiCoverageReportSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  manifestId: z.string().uuid().nullable(),
  analystUserId: z.string().uuid().nullable(),
  modelProvenance: aiModelProvenanceSchema,
  logline: z.string(),
  synopsis: z.string(),
  premiseRating: z.number().min(1).max(10),
  characterRating: z.number().min(1).max(10),
  dialogueRating: z.number().min(1).max(10),
  pacingRating: z.number().min(1).max(10),
  commercialViabilityRating: z.number().min(1).max(10),
  overallRecommendation: aiCoverageRecommendationSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  sceneCitations: z.array(aiSceneCitationSchema),
  harmEvalStatus: aiHarmEvalStatusSchema,
  harmEvalNotes: z.string().nullable(),
  humanReviewerId: z.string().uuid().nullable(),
  humanReviewStatus: aiHumanReviewStatusSchema,
  humanReviewNotes: z.string().nullable(),
  language: z.string().default('te-IN'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiCoverageReportDto = z.infer<typeof aiCoverageReportSchema>;

export const createAiCoverageReportSchema = z.object({
  filmId: z.string().uuid(),
  documentId: z.string().uuid(),
  manifestId: z.string().uuid().optional(),
  analystUserId: z.string().uuid().optional(),
  modelProvenance: aiModelProvenanceSchema,
  logline: z.string().min(1),
  synopsis: z.string().min(1),
  premiseRating: z.number().min(1).max(10),
  characterRating: z.number().min(1).max(10),
  dialogueRating: z.number().min(1).max(10),
  pacingRating: z.number().min(1).max(10),
  commercialViabilityRating: z.number().min(1).max(10),
  overallRecommendation: aiCoverageRecommendationSchema,
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  sceneCitations: z.array(aiSceneCitationSchema).default([]),
  harmEvalStatus: aiHarmEvalStatusSchema.default('passed'),
  harmEvalNotes: z.string().optional(),
  language: z.string().default('te-IN'),
});
export type CreateAiCoverageReportDto = z.infer<typeof createAiCoverageReportSchema>;

export const reviewAiCoverageReportSchema = z.object({
  humanReviewStatus: z.enum(['accepted', 'amended', 'rejected']),
  humanReviewNotes: z.string().optional(),
});
export type ReviewAiCoverageReportDto = z.infer<typeof reviewAiCoverageReportSchema>;

export const aiCharacterBreakdownSchema = z.object({
  name: z.string(),
  arcSummary: z.string(),
  castingPrototype: z.string().optional(),
  commercialHook: z.string().optional(),
});
export type AiCharacterBreakdown = z.infer<typeof aiCharacterBreakdownSchema>;

export const aiActSummarySchema = z.object({
  actNumber: z.number().int().min(1),
  summary: z.string(),
  keyHooks: z.array(z.string()).default([]),
});
export type AiActSummary = z.infer<typeof aiActSummarySchema>;

export const aiPitchPackageSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string(),
  logline: z.string(),
  toneAndGenre: z.string(),
  targetAudience: z.string(),
  comparableFilms: z.array(z.string()),
  characterBreakdowns: z.array(aiCharacterBreakdownSchema),
  actSummaries: z.array(aiActSummarySchema),
  visualPaletteNotes: z.string().nullable(),
  budgetTier: aiBudgetTierSchema,
  modelProvenance: aiModelProvenanceSchema,
  citations: z.array(z.record(z.string(), z.unknown())),
  humanReviewStatus: aiPitchReviewStatusSchema,
  reviewedBy: z.string().uuid().nullable(),
  language: z.string().default('te-IN'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiPitchPackageDto = z.infer<typeof aiPitchPackageSchema>;

export const createAiPitchPackageSchema = z.object({
  filmId: z.string().uuid(),
  title: z.string().min(1),
  logline: z.string().min(1),
  toneAndGenre: z.string().min(1),
  targetAudience: z.string().min(1),
  comparableFilms: z.array(z.string()).default([]),
  characterBreakdowns: z.array(aiCharacterBreakdownSchema).default([]),
  actSummaries: z.array(aiActSummarySchema).default([]),
  visualPaletteNotes: z.string().optional(),
  budgetTier: aiBudgetTierSchema,
  modelProvenance: aiModelProvenanceSchema,
  citations: z.array(z.record(z.string(), z.unknown())).default([]),
  language: z.string().default('te-IN'),
});
export type CreateAiPitchPackageDto = z.infer<typeof createAiPitchPackageSchema>;

export const reviewAiPitchPackageSchema = z.object({
  humanReviewStatus: z.enum(['reviewed', 'director_approved', 'producer_ready']),
});
export type ReviewAiPitchPackageDto = z.infer<typeof reviewAiPitchPackageSchema>;

// ── Sprint 28: Production Breakdown (Gate G7) ────────────────────

export const productionElementCategorySchema = z.enum([
  'cast',
  'location',
  'props',
  'costumes',
  'makeup_hair',
  'vehicles',
  'stunts',
  'special_effects',
  'visual_effects',
  'sound_music',
  'animals',
  'special_equipment',
  'art_department',
]);
export type ProductionElementCategory = z.infer<typeof productionElementCategorySchema>;

export const productionElementSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  category: productionElementCategorySchema,
  name: z.string().min(1).max(255),
  elementCode: z.string().min(1).max(50).nullable(),
  description: z.string().nullable(),
  estimatedCostCents: z.number().int().nonnegative(),
  isApproved: z.boolean(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionElementDto = z.infer<typeof productionElementSchema>;

export const createProductionElementSchema = z.object({
  filmId: z.string().uuid(),
  category: productionElementCategorySchema,
  name: z.string().min(1).max(255),
  elementCode: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  estimatedCostCents: z.number().int().nonnegative().default(0),
  isApproved: z.boolean().default(false),
});
export type CreateProductionElementDto = z.infer<typeof createProductionElementSchema>;

export const updateProductionElementSchema = z.object({
  elementCode: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  estimatedCostCents: z.number().int().nonnegative().optional(),
  isApproved: z.boolean().optional(),
});
export type UpdateProductionElementDto = z.infer<typeof updateProductionElementSchema>;

export const sceneBreakdownStatusSchema = z.enum([
  'draft',
  'reviewed',
  'locked',
  'ready_for_scheduling',
]);
export type SceneBreakdownStatus = z.infer<typeof sceneBreakdownStatusSchema>;

export const sceneBreakdownSheetSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  sceneId: z.string().uuid(),
  revisionId: z.string().uuid().nullable(),
  pageEighths: z.number().int().min(1),
  estimatedShootMinutes: z.number().int().nonnegative(),
  dramaticDay: z.string().nullable(),
  scriptDay: z.string().nullable(),
  synopsis: z.string().nullable(),
  setupNotes: z.string().nullable(),
  status: sceneBreakdownStatusSchema,
  lockedBy: z.string().uuid().nullable(),
  lockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SceneBreakdownSheetDto = z.infer<typeof sceneBreakdownSheetSchema>;

export const upsertSceneBreakdownSheetSchema = z.object({
  filmId: z.string().uuid(),
  sceneId: z.string().uuid(),
  revisionId: z.string().uuid().optional(),
  pageEighths: z.number().int().min(1).default(8),
  estimatedShootMinutes: z.number().int().nonnegative().default(60),
  dramaticDay: z.string().max(20).optional(),
  scriptDay: z.string().max(50).optional(),
  synopsis: z.string().optional(),
  setupNotes: z.string().optional(),
  status: sceneBreakdownStatusSchema.default('draft'),
});
export type UpsertSceneBreakdownSheetDto = z.infer<typeof upsertSceneBreakdownSheetSchema>;

export const breakdownItemSourceOriginSchema = z.enum([
  'manual',
  'ai_assisted',
  'script_extracted',
]);
export type BreakdownItemSourceOrigin = z.infer<typeof breakdownItemSourceOriginSchema>;

export const sceneBreakdownItemSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  breakdownSheetId: z.string().uuid(),
  elementId: z.string().uuid(),
  quantity: z.number().int().min(1),
  isRequired: z.boolean(),
  notes: z.string().nullable(),
  sourceOrigin: breakdownItemSourceOriginSchema,
  evidenceText: z.string().nullable(),
  userAmended: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Joined element fields when querying sheet details:
  elementName: z.string().optional(),
  elementCategory: productionElementCategorySchema.optional(),
  elementCode: z.string().nullable().optional(),
});
export type SceneBreakdownItemDto = z.infer<typeof sceneBreakdownItemSchema>;

export const addSceneBreakdownItemSchema = z.object({
  filmId: z.string().uuid(),
  breakdownSheetId: z.string().uuid(),
  elementId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(true),
  notes: z.string().optional(),
  sourceOrigin: breakdownItemSourceOriginSchema.default('manual'),
  evidenceText: z.string().optional(),
  userAmended: z.boolean().default(false),
});
export type AddSceneBreakdownItemDto = z.infer<typeof addSceneBreakdownItemSchema>;

export const sceneBreakdownFullSheetSchema = z.object({
  sheet: sceneBreakdownSheetSchema,
  items: z.array(sceneBreakdownItemSchema),
});
export type SceneBreakdownFullSheetDto = z.infer<typeof sceneBreakdownFullSheetSchema>;

// ── Sprint 29: Scheduling and Stripboard (Gate G7) ────────────────

export const scheduleStatusSchema = z.enum([
  'draft',
  'review',
  'approved',
  'archived',
]);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const shootingScheduleSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string().min(1).max(255),
  versionNumber: z.number().int().min(1),
  status: scheduleStatusSchema,
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string().nullable(),
  estimatedShootDays: z.number().int().min(1),
  notes: z.string().nullable(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ShootingScheduleDto = z.infer<typeof shootingScheduleSchema>;

export const createShootingScheduleSchema = z.object({
  filmId: z.string().uuid(),
  title: z.string().min(1).max(255),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  estimatedShootDays: z.number().int().min(1).default(1),
  notes: z.string().optional(),
});
export type CreateShootingScheduleDto = z.infer<typeof createShootingScheduleSchema>;

export const scheduleShootDaySchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  dayNumber: z.number().int().min(1),
  calendarDate: z.string(), // YYYY-MM-DD
  title: z.string().nullable(),
  callTime: z.string().nullable(), // HH:MM:SS
  wrapTime: z.string().nullable(),
  primaryLocation: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduleShootDayDto = z.infer<typeof scheduleShootDaySchema>;

export const createScheduleShootDaySchema = z.object({
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  dayNumber: z.number().int().min(1),
  calendarDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  title: z.string().max(255).optional(),
  callTime: z.string().optional(),
  wrapTime: z.string().optional(),
  primaryLocation: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateScheduleShootDayDto = z.infer<typeof createScheduleShootDaySchema>;

export const scheduleStripTypeSchema = z.enum([
  'scene',
  'day_banner',
  'company_move',
  'meal_break',
  'turnaround',
]);
export type ScheduleStripType = z.infer<typeof scheduleStripTypeSchema>;

export const scheduleIntExtSchema = z.enum(['INT', 'EXT', 'INT/EXT']);
export type ScheduleIntExt = z.infer<typeof scheduleIntExtSchema>;

export const scheduleDayNightSchema = z.enum(['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS']);
export type ScheduleDayNight = z.infer<typeof scheduleDayNightSchema>;

export const scheduleStripSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  stripType: scheduleStripTypeSchema,
  sceneId: z.string().uuid().nullable(),
  shootDayId: z.string().uuid().nullable(),
  stripOrder: z.number().int().nonnegative(),
  pageEighths: z.number().int().min(1).nullable(),
  estimatedMinutes: z.number().int().nonnegative(),
  intExt: scheduleIntExtSchema.nullable(),
  dayNight: scheduleDayNightSchema.nullable(),
  locationText: z.string().nullable(),
  description: z.string().nullable(),
  castIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduleStripDto = z.infer<typeof scheduleStripSchema>;

export const createScheduleStripSchema = z.object({
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  stripType: scheduleStripTypeSchema,
  sceneId: z.string().uuid().optional(),
  shootDayId: z.string().uuid().optional(),
  stripOrder: z.number().int().nonnegative(),
  pageEighths: z.number().int().min(1).optional(),
  estimatedMinutes: z.number().int().nonnegative().default(60),
  intExt: scheduleIntExtSchema.optional(),
  dayNight: scheduleDayNightSchema.optional(),
  locationText: z.string().optional(),
  description: z.string().optional(),
  castIds: z.array(z.string()).default([]),
});
export type CreateScheduleStripDto = z.infer<typeof createScheduleStripSchema>;

export const scheduleConstraintTypeSchema = z.enum([
  'actor_blackout',
  'location_permit',
  'daylight_window',
  'equipment_availability',
  'weather_window',
]);
export type ScheduleConstraintType = z.infer<typeof scheduleConstraintTypeSchema>;

export const scheduleConstraintSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  constraintType: scheduleConstraintTypeSchema,
  entityId: z.string().uuid().nullable(),
  name: z.string().min(1).max(255),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
  severity: z.enum(['hard', 'soft']),
  explanation: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduleConstraintDto = z.infer<typeof scheduleConstraintSchema>;

export const createScheduleConstraintSchema = z.object({
  filmId: z.string().uuid(),
  constraintType: scheduleConstraintTypeSchema,
  entityId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  severity: z.enum(['hard', 'soft']).default('hard'),
  explanation: z.string().min(1),
  isActive: z.boolean().default(true),
});
export type CreateScheduleConstraintDto = z.infer<typeof createScheduleConstraintSchema>;

export const scheduleConflictTypeSchema = z.enum([
  'actor_unavailable',
  'permit_expired',
  'overbooked_day',
  'turnaround_violation',
  'lighting_mismatch',
]);
export type ScheduleConflictType = z.infer<typeof scheduleConflictTypeSchema>;

export const scheduleConflictSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  stripId: z.string().uuid().nullable(),
  constraintId: z.string().uuid().nullable(),
  conflictType: scheduleConflictTypeSchema,
  description: z.string(),
  severity: z.enum(['critical', 'warning', 'advisory']),
  proposedResolution: z.string().nullable(),
  isOverridden: z.boolean(),
  overrideReason: z.string().nullable(),
  overriddenBy: z.string().uuid().nullable(),
  overriddenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ScheduleConflictDto = z.infer<typeof scheduleConflictSchema>;

export const createScheduleConflictSchema = z.object({
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  stripId: z.string().uuid().optional(),
  constraintId: z.string().uuid().optional(),
  conflictType: scheduleConflictTypeSchema,
  description: z.string().min(1),
  severity: z.enum(['critical', 'warning', 'advisory']),
  proposedResolution: z.string().optional(),
});
export type CreateScheduleConflictDto = z.infer<typeof createScheduleConflictSchema>;

export const overrideScheduleConflictSchema = z.object({
  overrideReason: z.string().min(1),
});
export type OverrideScheduleConflictDto = z.infer<typeof overrideScheduleConflictSchema>;

export const shootingScheduleFullBoardDtoSchema = z.object({
  schedule: shootingScheduleSchema,
  days: z.array(scheduleShootDaySchema),
  strips: z.array(scheduleStripSchema),
  conflicts: z.array(scheduleConflictSchema),
});
export type ShootingScheduleFullBoardDto = z.infer<typeof shootingScheduleFullBoardDtoSchema>;

// ── Sprint 30: Budget and Production Reporting (Gate G7 Exit) ────

export const productionBudgetStatusSchema = z.enum([
  'draft',
  'review',
  'locked',
  'approved',
  'archived',
]);
export type ProductionBudgetStatus = z.infer<typeof productionBudgetStatusSchema>;

export const productionBudgetCategorySchema = z.enum([
  'above_the_line',
  'below_the_line_production',
  'below_the_line_post',
  'other_production',
]);
export type ProductionBudgetCategory = z.infer<typeof productionBudgetCategorySchema>;

export const productionBudgetSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
  title: z.string().min(1).max(255),
  versionNumber: z.number().int().min(1),
  currency: z.string().min(3).max(10),
  contingencyPercentage: z.number().min(0).max(50),
  taxPercentage: z.number().min(0).max(50),
  status: productionBudgetStatusSchema,
  notes: z.string().nullable(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionBudgetDto = z.infer<typeof productionBudgetSchema>;

export const createProductionBudgetSchema = z.object({
  filmId: z.string().uuid(),
  scheduleId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  currency: z.string().default('INR'),
  contingencyPercentage: z.number().min(0).max(50).default(10.0),
  taxPercentage: z.number().min(0).max(50).default(18.0),
  notes: z.string().optional(),
});
export type CreateProductionBudgetDto = z.infer<typeof createProductionBudgetSchema>;

export const rateCardUnitSchema = z.enum([
  'hourly',
  'daily',
  'weekly',
  'flat',
  'per_item',
  'per_scene',
]);
export type RateCardUnit = z.infer<typeof rateCardUnitSchema>;

export const productionRateCardSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  name: z.string().min(1).max(255),
  category: productionBudgetCategorySchema,
  rateUnit: rateCardUnitSchema,
  standardRateCents: z.number().int().nonnegative(),
  overtimeRateCents: z.number().int().nonnegative().nullable(),
  currency: z.string().default('INR'),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionRateCardDto = z.infer<typeof productionRateCardSchema>;

export const createProductionRateCardSchema = z.object({
  filmId: z.string().uuid(),
  name: z.string().min(1).max(255),
  category: productionBudgetCategorySchema,
  rateUnit: rateCardUnitSchema,
  standardRateCents: z.number().int().nonnegative(),
  overtimeRateCents: z.number().int().nonnegative().optional(),
  currency: z.string().default('INR'),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductionRateCardDto = z.infer<typeof createProductionRateCardSchema>;

export const budgetLineItemSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  budgetId: z.string().uuid(),
  rateCardId: z.string().uuid().nullable(),
  elementId: z.string().uuid().nullable(),
  accountCode: z.string().min(1).max(20),
  category: productionBudgetCategorySchema,
  description: z.string().min(1).max(255),
  quantity: z.number().nonnegative(),
  unit: z.string().default('days'),
  unitRateCents: z.number().int().nonnegative(),
  fringePercentage: z.number().min(0).max(100),
  lowEstimateCents: z.number().int().nonnegative(),
  estimatedTotalCents: z.number().int().nonnegative(),
  highEstimateCents: z.number().int().nonnegative(),
  actualCostCents: z.number().int().nonnegative(),
  assumptions: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetLineItemDto = z.infer<typeof budgetLineItemSchema>;

export const createBudgetLineItemSchema = z.object({
  filmId: z.string().uuid(),
  budgetId: z.string().uuid(),
  rateCardId: z.string().uuid().optional(),
  elementId: z.string().uuid().optional(),
  accountCode: z.string().min(1).max(20),
  category: productionBudgetCategorySchema,
  description: z.string().min(1).max(255),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().default('days'),
  unitRateCents: z.number().int().nonnegative(),
  fringePercentage: z.number().min(0).max(100).default(0),
  lowEstimateCents: z.number().int().nonnegative().optional(),
  highEstimateCents: z.number().int().nonnegative().optional(),
  assumptions: z.string().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateBudgetLineItemDto = z.infer<typeof createBudgetLineItemSchema>;

export const costReportTypeSchema = z.enum([
  'budget_variance',
  'cost_to_complete',
  'top_sheet',
  'detailed_ledger',
]);
export type CostReportType = z.infer<typeof costReportTypeSchema>;

export const productionCostReportSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  budgetId: z.string().uuid(),
  reportType: costReportTypeSchema,
  title: z.string().min(1).max(255),
  subtotalCents: z.number().int().nonnegative(),
  contingencyCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  reportPayload: z.record(z.string(), z.unknown()),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type ProductionCostReportDto = z.infer<typeof productionCostReportSchema>;

export const topSheetCategorySummarySchema = z.object({
  category: productionBudgetCategorySchema,
  label: z.string(),
  lineItemCount: z.number().int().nonnegative(),
  budgetedSubtotalCents: z.number().int().nonnegative(),
  actualSubtotalCents: z.number().int().nonnegative(),
  varianceCents: z.number().int(),
});
export type TopSheetCategorySummaryDto = z.infer<typeof topSheetCategorySummarySchema>;

export const budgetTopSheetDtoSchema = z.object({
  budget: productionBudgetSchema,
  categories: z.array(topSheetCategorySummarySchema),
  subtotalCents: z.number().int().nonnegative(),
  contingencyCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  currency: z.string(),
});
export type BudgetTopSheetDto = z.infer<typeof budgetTopSheetDtoSchema>;

// ============================================================================
// Sprint 31: Multi-User Collaboration Contracts
// ============================================================================

export const collaborationTargetTypeSchema = z.enum([
  'document',
  'scene',
  'screenplay_block',
  'character',
  'sequence',
  'breakdown_item',
  'schedule_strip',
  'budget_line_item',
]);
export type CollaborationTargetType = z.infer<typeof collaborationTargetTypeSchema>;

export const collaborationThreadStatusSchema = z.enum(['open', 'resolved', 'archived']);
export type CollaborationThreadStatus = z.infer<typeof collaborationThreadStatusSchema>;

export const collaborationCommentFormatSchema = z.enum(['plain', 'markdown', 'rich_text']);
export type CollaborationCommentFormat = z.infer<typeof collaborationCommentFormatSchema>;

export const collaborationColorCategorySchema = z.enum([
  'yellow',
  'blue',
  'green',
  'pink',
  'purple',
  'orange',
]);
export type CollaborationColorCategory = z.infer<typeof collaborationColorCategorySchema>;

export const collaborationClientTypeSchema = z.enum(['web', 'android', 'ios', 'desktop']);
export type CollaborationClientType = z.infer<typeof collaborationClientTypeSchema>;

export const collaborationPresenceStateSchema = z.enum(['active', 'idle', 'offline']);
export type CollaborationPresenceState = z.infer<typeof collaborationPresenceStateSchema>;

export const collaborationNotificationEventTypeSchema = z.enum([
  'thread_created',
  'comment_added',
  'mention',
  'thread_resolved',
  'access_granted',
  'access_revoked',
  'revision_published',
  'conflict_detected',
]);
export type CollaborationNotificationEventType = z.infer<typeof collaborationNotificationEventTypeSchema>;

export const collaborationAnchorRangeSchema = z
  .object({
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    selectedText: z.string().optional(),
    blockId: z.string().uuid().optional(),
    sceneNumber: z.string().optional(),
    pageNumber: z.number().int().positive().optional(),
  })
  .passthrough();
export type CollaborationAnchorRange = z.infer<typeof collaborationAnchorRangeSchema>;

export const collaborationThreadSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  targetType: collaborationTargetTypeSchema,
  targetId: z.string().uuid(),
  anchorRange: collaborationAnchorRangeSchema.nullable().optional(),
  title: z.string().nullable().optional(),
  status: collaborationThreadStatusSchema,
  createdByUserId: z.string().uuid(),
  resolvedByUserId: z.string().uuid().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CollaborationThreadDto = z.infer<typeof collaborationThreadSchema>;

export const collaborationCommentSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  threadId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  parentCommentId: z.string().uuid().nullable().optional(),
  content: z.string(),
  contentFormat: collaborationCommentFormatSchema,
  isEdited: z.boolean(),
  deletedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CollaborationCommentDto = z.infer<typeof collaborationCommentSchema>;

export const collaborationAnnotationSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  targetType: z.enum(['document', 'scene', 'screenplay_block']),
  targetId: z.string().uuid(),
  colorCategory: collaborationColorCategorySchema,
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  highlightedText: z.string(),
  note: z.string().nullable().optional(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CollaborationAnnotationDto = z.infer<typeof collaborationAnnotationSchema>;

export const collaborationPresenceSessionSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
  clientType: collaborationClientTypeSchema,
  activeDocumentId: z.string().uuid().nullable().optional(),
  activeSceneId: z.string().uuid().nullable().optional(),
  cursorPosition: z.record(z.string(), z.unknown()).nullable().optional(),
  state: collaborationPresenceStateSchema,
  lastHeartbeat: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type CollaborationPresenceSessionDto = z.infer<typeof collaborationPresenceSessionSchema>;

export const collaborationNotificationSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  senderUserId: z.string().uuid().nullable().optional(),
  eventType: collaborationNotificationEventTypeSchema,
  entityType: z.string(),
  entityId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  isRead: z.boolean(),
  readAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type CollaborationNotificationDto = z.infer<typeof collaborationNotificationSchema>;

export const createCollaborationThreadInputSchema = z.object({
  filmId: z.string().uuid(),
  targetType: collaborationTargetTypeSchema,
  targetId: z.string().uuid(),
  anchorRange: collaborationAnchorRangeSchema.optional(),
  title: z.string().optional(),
  initialComment: z.string().min(1),
  contentFormat: collaborationCommentFormatSchema.default('plain').optional(),
});
export type CreateCollaborationThreadInput = z.infer<typeof createCollaborationThreadInputSchema>;

export const createCollaborationCommentInputSchema = z.object({
  filmId: z.string().uuid(),
  threadId: z.string().uuid(),
  parentCommentId: z.string().uuid().optional(),
  content: z.string().min(1),
  contentFormat: collaborationCommentFormatSchema.default('plain').optional(),
});
export type CreateCollaborationCommentInput = z.infer<typeof createCollaborationCommentInputSchema>;

export const createCollaborationAnnotationInputSchema = z.object({
  filmId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  targetType: z.enum(['document', 'scene', 'screenplay_block']),
  targetId: z.string().uuid(),
  colorCategory: collaborationColorCategorySchema.default('yellow').optional(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  highlightedText: z.string().min(1),
  note: z.string().optional(),
});
export type CreateCollaborationAnnotationInput = z.infer<typeof createCollaborationAnnotationInputSchema>;

export const updateCollaborationPresenceInputSchema = z.object({
  filmId: z.string().uuid(),
  deviceId: z.string().uuid(),
  clientType: collaborationClientTypeSchema.default('web'),
  activeDocumentId: z.string().uuid().optional(),
  activeSceneId: z.string().uuid().optional(),
  cursorPosition: z.record(z.string(), z.unknown()).optional(),
  state: collaborationPresenceStateSchema.default('active'),
});
export type UpdateCollaborationPresenceInput = z.infer<typeof updateCollaborationPresenceInputSchema>;

export const collaborationThreadWithCommentsDtoSchema = z.object({
  thread: collaborationThreadSchema,
  comments: z.array(collaborationCommentSchema),
});
export type CollaborationThreadWithCommentsDto = z.infer<typeof collaborationThreadWithCommentsDtoSchema>;

// ============================================================================
// Sprint 32: Film Administration and Approvals Contracts
// ============================================================================

export const filmApprovalPolicyTypeSchema = z.enum([
  'screenplay_draft',
  'shooting_schedule',
  'production_budget',
  'casting_lock',
  'final_cut',
  'general_decision',
]);
export type FilmApprovalPolicyType = z.infer<typeof filmApprovalPolicyTypeSchema>;

export const filmApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export type FilmApprovalStatus = z.infer<typeof filmApprovalStatusSchema>;

export const filmApprovalDecisionValueSchema = z.enum(['approved', 'rejected', 'abstained']);
export type FilmApprovalDecisionValue = z.infer<typeof filmApprovalDecisionValueSchema>;

export const filmOwnershipTransferStatusSchema = z.enum([
  'initiated',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);
export type FilmOwnershipTransferStatus = z.infer<typeof filmOwnershipTransferStatusSchema>;

export const adminBreakGlassStatusSchema = z.enum(['active', 'closed', 'revoked']);
export type AdminBreakGlassStatus = z.infer<typeof adminBreakGlassStatusSchema>;

export const filmLifecycleRequestTypeSchema = z.enum([
  'export_archive',
  'permanent_delete',
  'soft_archive',
]);
export type FilmLifecycleRequestType = z.infer<typeof filmLifecycleRequestTypeSchema>;

export const filmLifecycleRequestStatusSchema = z.enum([
  'requested',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);
export type FilmLifecycleRequestStatus = z.infer<typeof filmLifecycleRequestStatusSchema>;

export const filmApprovalPolicySchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  policyType: filmApprovalPolicyTypeSchema,
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  requiredRoleKeys: z.array(z.string()),
  minApprovals: z.number().int().min(1),
  isSequential: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FilmApprovalPolicyDto = z.infer<typeof filmApprovalPolicySchema>;

export const filmApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  policyId: z.string().uuid(),
  targetType: z.enum(['document', 'schedule', 'budget', 'character', 'cut', 'other']),
  targetId: z.string().uuid(),
  title: z.string().min(1).max(255),
  summary: z.string().nullable().optional(),
  status: filmApprovalStatusSchema,
  requestedBy: z.string().uuid(),
  decidedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FilmApprovalRequestDto = z.infer<typeof filmApprovalRequestSchema>;

export const filmApprovalDecisionSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  filmId: z.string().uuid(),
  approverUserId: z.string().uuid(),
  decision: filmApprovalDecisionValueSchema,
  feedback: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type FilmApprovalDecisionDto = z.infer<typeof filmApprovalDecisionSchema>;

export const filmApprovalRequestWithDecisionsDtoSchema = z.object({
  request: filmApprovalRequestSchema,
  decisions: z.array(filmApprovalDecisionSchema),
});
export type FilmApprovalRequestWithDecisionsDto = z.infer<
  typeof filmApprovalRequestWithDecisionsDtoSchema
>;

export const filmOwnershipTransferSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  currentOwnerUserId: z.string().uuid(),
  targetOwnerUserId: z.string().uuid(),
  initiatedBy: z.string().uuid(),
  status: filmOwnershipTransferStatusSchema,
  reason: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type FilmOwnershipTransferDto = z.infer<typeof filmOwnershipTransferSchema>;

export const adminBreakGlassSessionSchema = z.object({
  id: z.string().uuid(),
  adminUserId: z.string().uuid(),
  targetFilmId: z.string().uuid(),
  reason: z.string().min(10),
  ticketReference: z.string().min(3),
  status: adminBreakGlassStatusSchema,
  expiresAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type AdminBreakGlassSessionDto = z.infer<typeof adminBreakGlassSessionSchema>;

export const filmRetentionPolicySchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  retentionPeriodDays: z.number().int().min(1),
  autoPurgeDeletedItems: z.boolean(),
  purgeDelayDays: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FilmRetentionPolicyDto = z.infer<typeof filmRetentionPolicySchema>;

export const filmLifecycleRequestSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  requestType: filmLifecycleRequestTypeSchema,
  status: filmLifecycleRequestStatusSchema,
  exportManifest: z.record(z.string(), z.unknown()).nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type FilmLifecycleRequestDto = z.infer<typeof filmLifecycleRequestSchema>;

export const createFilmApprovalPolicyInputSchema = z.object({
  filmId: z.string().uuid(),
  policyType: filmApprovalPolicyTypeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  requiredRoleKeys: z.array(z.string()).default([]),
  minApprovals: z.number().int().min(1).default(1),
  isSequential: z.boolean().default(false),
});
export type CreateFilmApprovalPolicyInput = z.infer<typeof createFilmApprovalPolicyInputSchema>;

export const createFilmApprovalRequestInputSchema = z.object({
  filmId: z.string().uuid(),
  policyId: z.string().uuid(),
  targetType: z.enum(['document', 'schedule', 'budget', 'character', 'cut', 'other']),
  targetId: z.string().uuid(),
  title: z.string().min(1).max(255),
  summary: z.string().optional(),
});
export type CreateFilmApprovalRequestInput = z.infer<typeof createFilmApprovalRequestInputSchema>;

export const recordFilmApprovalDecisionInputSchema = z.object({
  filmId: z.string().uuid(),
  requestId: z.string().uuid(),
  decision: filmApprovalDecisionValueSchema,
  feedback: z.string().optional(),
  signature: z.string().optional(),
});
export type RecordFilmApprovalDecisionInput = z.infer<
  typeof recordFilmApprovalDecisionInputSchema
>;

export const initiateFilmOwnershipTransferInputSchema = z.object({
  filmId: z.string().uuid(),
  targetOwnerUserId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  expiryHours: z.number().int().min(1).max(168).default(48),
});
export type InitiateFilmOwnershipTransferInput = z.infer<
  typeof initiateFilmOwnershipTransferInputSchema
>;

export const createAdminBreakGlassInputSchema = z.object({
  targetFilmId: z.string().uuid(),
  reason: z.string().min(10),
  ticketReference: z.string().min(3),
  sessionDurationMinutes: z.number().int().min(5).max(480).default(60),
});
export type CreateAdminBreakGlassInput = z.infer<typeof createAdminBreakGlassInputSchema>;

export const upsertFilmRetentionPolicyInputSchema = z.object({
  filmId: z.string().uuid(),
  retentionPeriodDays: z.number().int().min(1).default(365),
  autoPurgeDeletedItems: z.boolean().default(true),
  purgeDelayDays: z.number().int().min(0).default(30),
});
export type UpsertFilmRetentionPolicyInput = z.infer<
  typeof upsertFilmRetentionPolicyInputSchema
>;

export const createFilmLifecycleRequestInputSchema = z.object({
  filmId: z.string().uuid(),
  requestType: filmLifecycleRequestTypeSchema,
  exportManifest: z.record(z.string(), z.unknown()).optional(),
});
export type CreateFilmLifecycleRequestInput = z.infer<
  typeof createFilmLifecycleRequestInputSchema
>;

// ============================================================================
// Sprint 33: Quotas and Enterprise Readiness Contracts
// ============================================================================

export const organizationQuotaTierSchema = z.enum(['standard', 'pro', 'enterprise', 'custom']);
export type OrganizationQuotaTier = z.infer<typeof organizationQuotaTierSchema>;

export const dataResidencyRegionSchema = z.enum([
  'in-south-1',
  'in-west-1',
  'ap-south-1',
  'us-east-1',
  'eu-west-1',
]);
export type DataResidencyRegion = z.infer<typeof dataResidencyRegionSchema>;

export const quotaResourceTypeSchema = z.enum([
  'storage_bytes',
  'ai_tokens',
  'export_count',
  'member_count',
  'concurrent_session',
]);
export type QuotaResourceType = z.infer<typeof quotaResourceTypeSchema>;

export const enterpriseLegalConsentTypeSchema = z.enum([
  'data_processing_agreement',
  'privacy_policy',
  'ai_training_opt_out',
  'intellectual_property_waiver',
  'nda_acknowledgement',
]);
export type EnterpriseLegalConsentType = z.infer<typeof enterpriseLegalConsentTypeSchema>;

export const organizationQuotaSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  tier: organizationQuotaTierSchema,
  maxStorageBytes: z.number().int().nonnegative(),
  usedStorageBytes: z.number().int().nonnegative(),
  maxFilms: z.number().int().positive(),
  maxMembersPerFilm: z.number().int().positive(),
  maxMonthlyAiTokens: z.number().int().nonnegative(),
  usedMonthlyAiTokens: z.number().int().nonnegative(),
  maxConcurrentEditors: z.number().int().positive(),
  dataResidencyRegion: dataResidencyRegionSchema,
  enforceStrictQuotas: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OrganizationQuotaDto = z.infer<typeof organizationQuotaSchema>;

export const enterpriseFeaturePolicySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  featureKey: z.string().min(1),
  isEnabled: z.boolean(),
  policyRules: z.record(z.string(), z.unknown()),
  updatedBy: z.string().uuid().nullable().optional(),
  updatedAt: z.string().datetime(),
});
export type EnterpriseFeaturePolicyDto = z.infer<typeof enterpriseFeaturePolicySchema>;

export const quotaUsageRecordSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().nullable().optional(),
  resourceType: quotaResourceTypeSchema,
  delta: z.number().int(),
  actorUserId: z.string().uuid().nullable().optional(),
  referenceId: z.string().uuid().nullable().optional(),
  recordedAt: z.string().datetime(),
});
export type QuotaUsageRecordDto = z.infer<typeof quotaUsageRecordSchema>;

export const enterpriseLegalConsentSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().nullable().optional(),
  consentType: enterpriseLegalConsentTypeSchema,
  version: z.string().min(1),
  consentedByUserId: z.string().uuid(),
  consentedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});
export type EnterpriseLegalConsentDto = z.infer<typeof enterpriseLegalConsentSchema>;

export const quotaCheckResultSchema = z.object({
  allowed: z.boolean(),
  resourceType: quotaResourceTypeSchema,
  limit: z.number().int().nonnegative(),
  currentUsage: z.number().int().nonnegative(),
  remaining: z.number().int(),
  reason: z.string().optional(),
});
export type QuotaCheckResultDto = z.infer<typeof quotaCheckResultSchema>;

export const upsertOrganizationQuotaInputSchema = z.object({
  organizationId: z.string().uuid(),
  tier: organizationQuotaTierSchema.default('standard'),
  maxStorageBytes: z.number().int().nonnegative().optional(),
  maxFilms: z.number().int().positive().optional(),
  maxMembersPerFilm: z.number().int().positive().optional(),
  maxMonthlyAiTokens: z.number().int().nonnegative().optional(),
  maxConcurrentEditors: z.number().int().positive().optional(),
  dataResidencyRegion: dataResidencyRegionSchema.default('in-south-1'),
  enforceStrictQuotas: z.boolean().default(true),
});
export type UpsertOrganizationQuotaInput = z.infer<
  typeof upsertOrganizationQuotaInputSchema
>;

export const checkQuotaAllowanceInputSchema = z.object({
  organizationId: z.string().uuid(),
  resourceType: quotaResourceTypeSchema,
  requestedDelta: z.number().int().positive(),
});
export type CheckQuotaAllowanceInput = z.infer<typeof checkQuotaAllowanceInputSchema>;

export const recordQuotaUsageInputSchema = z.object({
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().optional(),
  resourceType: quotaResourceTypeSchema,
  delta: z.number().int(),
  referenceId: z.string().uuid().optional(),
});
export type RecordQuotaUsageInput = z.infer<typeof recordQuotaUsageInputSchema>;

export const upsertEnterpriseFeaturePolicyInputSchema = z.object({
  organizationId: z.string().uuid(),
  featureKey: z.string().min(1),
  isEnabled: z.boolean().default(true),
  policyRules: z.record(z.string(), z.unknown()).default({}),
});
export type UpsertEnterpriseFeaturePolicyInput = z.infer<
  typeof upsertEnterpriseFeaturePolicyInputSchema
>;

export const recordEnterpriseLegalConsentInputSchema = z.object({
  organizationId: z.string().uuid(),
  filmId: z.string().uuid().optional(),
  consentType: enterpriseLegalConsentTypeSchema,
  version: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RecordEnterpriseLegalConsentInput = z.infer<
  typeof recordEnterpriseLegalConsentInputSchema
>;

// ============================================================================
// Sprint 34: Knowledge, Advanced Search, and Multilingual Expansion Contracts
// ============================================================================

export const knowledgeAssetCategorySchema = z.enum([
  'historical_reference',
  'mythology_lore',
  'dialect_dictionary',
  'world_bible',
  'visual_moodboard',
  'legal_document',
  'custom_reference',
]);
export type KnowledgeAssetCategory = z.infer<typeof knowledgeAssetCategorySchema>;

export const knowledgeContentFormatSchema = z.enum(['markdown', 'plain', 'structured_json']);
export type KnowledgeContentFormat = z.infer<typeof knowledgeContentFormatSchema>;

export const teluguDialectRegionSchema = z.enum([
  'telangana',
  'rayalaseema',
  'uttarandhra',
  'coastal_andhra',
  'hyderabad_slang',
  'archaic_epic',
]);
export type TeluguDialectRegion = z.infer<typeof teluguDialectRegionSchema>;

export const knowledgeReferenceTargetTypeSchema = z.enum([
  'scene',
  'character',
  'sequence',
  'screenplay_block',
]);
export type KnowledgeReferenceTargetType = z.infer<typeof knowledgeReferenceTargetTypeSchema>;

export const projectKnowledgeAssetSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  title: z.string().min(1).max(255),
  category: knowledgeAssetCategorySchema,
  language: z.string(),
  contentFormat: knowledgeContentFormatSchema,
  textContent: z.string().min(1),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectKnowledgeAssetDto = z.infer<typeof projectKnowledgeAssetSchema>;

export const knowledgeSearchChunkSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  assetId: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  chunkText: z.string().min(1),
  language: z.string(),
  embeddingModel: z.string(),
  embeddingVector: z.array(z.number()).nullable().optional(),
  createdAt: z.string().datetime(),
});
export type KnowledgeSearchChunkDto = z.infer<typeof knowledgeSearchChunkSchema>;

export const knowledgeAssetReferenceSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  assetId: z.string().uuid(),
  targetType: knowledgeReferenceTargetTypeSchema,
  targetId: z.string().uuid(),
  relevanceNotes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type KnowledgeAssetReferenceDto = z.infer<typeof knowledgeAssetReferenceSchema>;

export const teluguDialectTermSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  standardTerm: z.string().min(1),
  dialectTerm: z.string().min(1),
  dialectRegion: teluguDialectRegionSchema,
  meaning: z.string().min(1),
  exampleDialogue: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type TeluguDialectTermDto = z.infer<typeof teluguDialectTermSchema>;

export const knowledgeSearchResultSchema = z.object({
  chunk: knowledgeSearchChunkSchema,
  assetTitle: z.string(),
  category: knowledgeAssetCategorySchema,
  similarityScore: z.number(),
  matchSnippet: z.string(),
});
export type KnowledgeSearchResultDto = z.infer<typeof knowledgeSearchResultSchema>;

export const createProjectKnowledgeAssetInputSchema = z.object({
  filmId: z.string().uuid(),
  title: z.string().min(1).max(255),
  category: knowledgeAssetCategorySchema,
  language: z.string().default('te-IN'),
  contentFormat: knowledgeContentFormatSchema.default('markdown'),
  textContent: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateProjectKnowledgeAssetInput = z.infer<
  typeof createProjectKnowledgeAssetInputSchema
>;

export const createKnowledgeChunkInputSchema = z.object({
  filmId: z.string().uuid(),
  assetId: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  chunkText: z.string().min(1),
  language: z.string().default('te-IN'),
  embeddingModel: z.string().default('text-embedding-004'),
  embeddingVector: z.array(z.number()).optional(),
});
export type CreateKnowledgeChunkInput = z.infer<typeof createKnowledgeChunkInputSchema>;

export const createKnowledgeReferenceInputSchema = z.object({
  filmId: z.string().uuid(),
  assetId: z.string().uuid(),
  targetType: knowledgeReferenceTargetTypeSchema,
  targetId: z.string().uuid(),
  relevanceNotes: z.string().optional(),
});
export type CreateKnowledgeReferenceInput = z.infer<
  typeof createKnowledgeReferenceInputSchema
>;

export const createTeluguDialectTermInputSchema = z.object({
  filmId: z.string().uuid(),
  standardTerm: z.string().min(1),
  dialectTerm: z.string().min(1),
  dialectRegion: teluguDialectRegionSchema,
  meaning: z.string().min(1),
  exampleDialogue: z.string().optional(),
});
export type CreateTeluguDialectTermInput = z.infer<
  typeof createTeluguDialectTermInputSchema
>;

export const searchKnowledgeQueryInputSchema = z.object({
  filmId: z.string().uuid(),
  query: z.string().min(1),
  category: knowledgeAssetCategorySchema.optional(),
  limit: z.number().int().positive().default(10),
  queryEmbedding: z.array(z.number()).optional(),
});
export type SearchKnowledgeQueryInput = z.infer<typeof searchKnowledgeQueryInputSchema>;

// --- SPRINT 35: Portfolio, Interoperability, and Extension Boundaries ---

export const portfolioSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  filmCount: z.number().int().nonnegative(),
  totalScenes: z.number().int().nonnegative(),
  totalEstimatedBudgetPaise: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PortfolioSummaryDto = z.infer<typeof portfolioSummaryDtoSchema>;

export const createPortfolioInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePortfolioInput = z.infer<typeof createPortfolioInputSchema>;

export const interopJobTypeSchema = z.enum(['import', 'export', 'migration']);
export type InteropJobType = z.infer<typeof interopJobTypeSchema>;

export const interopFormatSchema = z.enum([
  'pdf',
  'docx',
  'txt',
  'fountain',
  'fdx',
  'csv',
  'xlsx',
]);
export type InteropFormat = z.infer<typeof interopFormatSchema>;

export const interopJobStatusSchema = z.enum([
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type InteropJobStatus = z.infer<typeof interopJobStatusSchema>;

export const fileInteropJobDtoSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  jobType: interopJobTypeSchema,
  format: interopFormatSchema,
  sourceFileStorageKey: z.string().nullable().optional(),
  resultFileStorageKey: z.string().nullable().optional(),
  status: interopJobStatusSchema,
  inputMetadata: z.record(z.string(), z.unknown()),
  outputSummary: z.record(z.string(), z.unknown()),
  conformanceReport: z.record(z.string(), z.unknown()),
  errorMessage: z.string().nullable().optional(),
  retainedSourceOnFailure: z.boolean(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FileInteropJobDto = z.infer<typeof fileInteropJobDtoSchema>;

export const createFileInteropJobInputSchema = z.object({
  filmId: z.string().uuid(),
  jobType: interopJobTypeSchema,
  format: interopFormatSchema,
  sourceFileStorageKey: z.string().optional(),
  inputMetadata: z.record(z.string(), z.unknown()).optional(),
  retainedSourceOnFailure: z.boolean().default(true),
  createdBy: z.string().uuid(),
});
export type CreateFileInteropJobInput = z.infer<typeof createFileInteropJobInputSchema>;

export const extensionSandboxPermissionSchema = z.enum([
  'screenplay:read',
  'screenplay:write',
  'production:read',
  'production:write',
  'export:read',
  'network:restricted',
]);
export type ExtensionSandboxPermission = z.infer<typeof extensionSandboxPermissionSchema>;

export const extensionManifestDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  extensionIdentifier: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sandboxPermissions: z.array(extensionSandboxPermissionSchema),
  allowedEndpoints: z.array(z.string()),
  isVerified: z.boolean(),
  status: z.enum(['active', 'disabled', 'revoked']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExtensionManifestDto = z.infer<typeof extensionManifestDtoSchema>;

export const registerExtensionManifestInputSchema = z.object({
  organizationId: z.string().uuid(),
  extensionIdentifier: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sandboxPermissions: z.array(extensionSandboxPermissionSchema).default([]),
  allowedEndpoints: z.array(z.string()).default([]),
  isVerified: z.boolean().default(false),
});
export type RegisterExtensionManifestInput = z.infer<
  typeof registerExtensionManifestInputSchema
>;

export const extensionAuditLogDtoSchema = z.object({
  id: z.string().uuid(),
  extensionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  action: z.string().min(1),
  targetResource: z.string().min(1),
  sandboxBoundaryEnforced: z.boolean(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type ExtensionAuditLogDto = z.infer<typeof extensionAuditLogDtoSchema>;












