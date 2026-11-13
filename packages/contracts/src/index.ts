import { z } from 'zod';
import { screenplayDocumentSchema } from '@film-studio/screenplay-model';

export const appEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().url().startsWith('postgresql://'),
    REDIS_URL: z.string().url().startsWith('redis://'),
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

export type DocumentResource = z.infer<typeof documentResourceSchema>;
export type SceneResource = z.infer<typeof sceneResourceSchema>;
