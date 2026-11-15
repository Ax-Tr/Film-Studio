import { Module, type DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import type { AppEnvironment } from '@film-studio/contracts';
import { DatabasePoolService } from '../../database/database-pool.service.js';
import { PostgresAuthTransactionRepository } from '../../database/postgres-auth-transaction.repository.js';
import { PostgresAuditRepository } from '../../database/postgres-audit.repository.js';
import { PostgresAuthorizationRepository } from '../../database/postgres-authorization.repository.js';
import { PostgresCharacterRepository } from '../../database/postgres-character.repository.js';
import { PostgresContentRepository } from '../../database/postgres-content.repository.js';
import { PostgresIdentityRepository } from '../../database/postgres-identity.repository.js';
import { PostgresSessionRepository } from '../../database/postgres-session.repository.js';
import { PostgresTenantRepository } from '../../database/postgres-tenant.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../authorization/permission.service.js';
import { CharacterController } from '../content/character.controller.js';
import { CharacterService } from '../content/character.service.js';
import { ContentController } from '../content/content.controller.js';
import { ContentService } from '../content/content.service.js';
import { CONTENT_SERVICE } from '../content/content.tokens.js';
import { TenantController } from '../tenant/tenant.controller.js';
import { TenantService } from '../tenant/tenant.service.js';
import { TENANT_SERVICE } from '../tenant/tenant.tokens.js';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';
import { AuthFlowService } from './auth-flow.service.js';
import { OidcTransactionService } from './oidc-transaction.service.js';
import { SessionService } from './session.service.js';
import { StandardOidcClient } from './standard-oidc.client.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { AUTH_ENVIRONMENT, AUTH_FLOW, SESSION_SERVICE } from './auth.tokens.js';

const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');
const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
const OIDC_CLIENT = Symbol('OIDC_CLIENT');
const OIDC_TRANSACTIONS = Symbol('OIDC_TRANSACTIONS');
const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');
const AUTHORIZATION_REPOSITORY = Symbol('AUTHORIZATION_REPOSITORY');
const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
const CONTENT_REPOSITORY = Symbol('CONTENT_REPOSITORY');
const CHARACTER_REPOSITORY = Symbol('CHARACTER_REPOSITORY');

@Module({})
export class AuthModule {
  static register(environment: AppEnvironment): DynamicModule {
    return {
      module: AuthModule,
      controllers: [
        AuthController,
        MeController,
        TenantController,
        ContentController,
        CharacterController,
      ],
      providers: [
        { provide: AUTH_ENVIRONMENT, useValue: environment },
        {
          provide: DatabasePoolService,
          useFactory: () => new DatabasePoolService(environment.DATABASE_URL),
        },
        {
          provide: Pool,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) => database.pool,
        },
        {
          provide: TRANSACTION_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresAuthTransactionRepository(database.pool),
        },
        {
          provide: IDENTITY_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresIdentityRepository(database.pool),
        },
        {
          provide: SESSION_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresSessionRepository(database.pool),
        },
        {
          provide: TENANT_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresTenantRepository(database.pool),
        },
        {
          provide: AUTHORIZATION_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresAuthorizationRepository(database.pool),
        },
        {
          provide: AUDIT_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresAuditRepository(database.pool),
        },
        {
          provide: CONTENT_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresContentRepository(database.pool),
        },
        {
          provide: CHARACTER_REPOSITORY,
          inject: [DatabasePoolService],
          useFactory: (database: DatabasePoolService) =>
            new PostgresCharacterRepository(database.pool),
        },
        {
          provide: PermissionService,
          inject: [AUTHORIZATION_REPOSITORY],
          useFactory: (
            repository: ConstructorParameters<typeof PermissionService>[0],
          ) => new PermissionService(repository),
        },
        {
          provide: AuditService,
          inject: [AUDIT_REPOSITORY],
          useFactory: (
            repository: ConstructorParameters<typeof AuditService>[0],
          ) => new AuditService(repository),
        },
        {
          provide: CharacterService,
          inject: [CHARACTER_REPOSITORY, PermissionService, AuditService],
          useFactory: (
            repository: ConstructorParameters<typeof CharacterService>[0],
            permissions: PermissionService,
            audit: AuditService,
          ) => new CharacterService(repository, permissions, audit),
        },
        {
          provide: TENANT_SERVICE,
          inject: [TENANT_REPOSITORY, PermissionService, AuditService],
          useFactory: (
            repository: ConstructorParameters<typeof TenantService>[0],
            permissions: PermissionService,
            audit: AuditService,
          ) => new TenantService(repository, permissions, audit),
        },
        {
          provide: CONTENT_SERVICE,
          inject: [CONTENT_REPOSITORY, PermissionService, AuditService],
          useFactory: (
            repository: ConstructorParameters<typeof ContentService>[0],
            permissions: PermissionService,
            audit: AuditService,
          ) => new ContentService(repository, permissions, audit),
        },
        {
          provide: OIDC_TRANSACTIONS,
          inject: [TRANSACTION_REPOSITORY],
          useFactory: (
            repository: ConstructorParameters<typeof OidcTransactionService>[0],
          ) =>
            new OidcTransactionService(
              repository,
              required(environment.AUTH_TRANSACTION_ENCRYPTION_KEY),
            ),
        },
        {
          provide: OIDC_CLIENT,
          useFactory: () =>
            new StandardOidcClient({
              issuer: new URL(required(environment.OIDC_ISSUER_URL)),
              clientId: required(environment.OIDC_CLIENT_ID),
              ...(environment.OIDC_CLIENT_SECRET === undefined
                ? {}
                : { clientSecret: environment.OIDC_CLIENT_SECRET }),
            }),
        },
        {
          provide: SESSION_SERVICE,
          inject: [SESSION_REPOSITORY],
          useFactory: (
            repository: ConstructorParameters<typeof SessionService>[0],
          ) =>
            new SessionService(repository, {
              accessTokenTtlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS,
              refreshTokenTtlSeconds: environment.REFRESH_TOKEN_TTL_SECONDS,
            }),
        },
        {
          provide: AUTH_FLOW,
          inject: [
            OIDC_TRANSACTIONS,
            OIDC_CLIENT,
            IDENTITY_REPOSITORY,
            SESSION_SERVICE,
          ],
          useFactory: (
            transactions: OidcTransactionService,
            oidcClient: StandardOidcClient,
            identities: ConstructorParameters<typeof AuthFlowService>[2],
            sessions: SessionService,
          ) =>
            new AuthFlowService(transactions, oidcClient, identities, sessions),
        },
        SessionAuthGuard,
      ],
    };
  }
}

function required(value: string | undefined): string {
  if (value === undefined)
    throw new Error('Required identity configuration is absent.');
  return value;
}
