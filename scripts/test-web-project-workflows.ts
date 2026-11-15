import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresAuditRepository } from '../backend/src/database/postgres-audit.repository.js';
import { PostgresAuthorizationRepository } from '../backend/src/database/postgres-authorization.repository.js';
import { PostgresContentRepository } from '../backend/src/database/postgres-content.repository.js';
import { PostgresTenantRepository } from '../backend/src/database/postgres-tenant.repository.js';
import { AuditService } from '../backend/src/modules/audit/audit.service.js';
import { PermissionService } from '../backend/src/modules/authorization/permission.service.js';
import { ContentService } from '../backend/src/modules/content/content.service.js';
import {
  TenantService,
  type MutationContext,
} from '../backend/src/modules/tenant/tenant.service.js';
import {
  getTranslations,
  supportedLocales,
} from '../packages/localization/src/index.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577';
const deviceId = '018f4ce4-f25b-7be7-834f-3705035f58c1';
const sessionId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';

function context(userId: string): MutationContext {
  return {
    userId,
    sessionId,
    requestId: randomUUID(),
  };
}

async function expectError(
  operation: Promise<unknown>,
  expectedErrorCodes: readonly string[],
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      expectedErrorCodes.includes(String(error.code))
    ) {
      return;
    }
    if (
      error instanceof Error &&
      expectedErrorCodes.some((code) => error.message.includes(code))
    ) {
      return;
    }
    throw error;
  }
  throw new Error(
    `Expected one of [${expectedErrorCodes.join(', ')}] but operation succeeded.`,
  );
}

async function main(): Promise<void> {
  const database = new PGlite();
  const migrationDirectory = fileURLToPath(
    new URL('../infra/database/migrations/', import.meta.url),
  );
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = await readFile(
      fileURLToPath(new URL(file, import.meta.url ? `file://${migrationDirectory}/` : '')),
      'utf8',
    );
    await database.exec(sql);
  }

  const pool = new Pool(createPgConfig(database));

  // Seed baseline users and organizations
  await pool.query(`
    INSERT INTO users (id, display_name, primary_email)
    VALUES
      ('${userOne}', 'Filmmaker One', 'filmmaker1@example.test'),
      ('${userTwo}', 'Filmmaker Two', 'filmmaker2@example.test');

    SELECT set_config('app.user_id', '${userOne}', false);
    SELECT app_security.create_organization('${organizationOne}', 'Studio One');

    SELECT set_config('app.user_id', '${userTwo}', false);
    SELECT app_security.create_organization('${organizationTwo}', 'Studio Two');

    INSERT INTO devices (id, user_id, platform, label)
    VALUES ('${deviceId}', '${userOne}', 'web', 'Chrome on Windows');

    INSERT INTO sessions (
      id, family_id, user_id, device_id, access_token_hash, refresh_token_hash,
      access_expires_at, refresh_expires_at, authenticated_at
    ) VALUES (
      '${sessionId}', '${sessionId}', '${userOne}', '${deviceId}',
      decode('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
      decode('fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', 'hex'),
      now() + interval '1 hour', now() + interval '30 days', now()
    );
  `);

  const auditRepo = new PostgresAuditRepository(pool);
  const auditService = new AuditService(auditRepo);
  const authRepo = new PostgresAuthorizationRepository(pool);
  const permissions = new PermissionService(authRepo);
  const tenantRepo = new PostgresTenantRepository(pool);
  const tenants = new TenantService(tenantRepo, permissions, auditService);
  const contentRepo = new PostgresContentRepository(pool);
  const content = new ContentService(contentRepo, permissions, auditService);

  // 1. Create Film
  const createdFilm = await tenants.createFilm(
    context(userOne),
    organizationOne,
    'Sankalp: The Resolution',
  );
  if (!createdFilm.id) throw new Error('Film was not created.');

  // 2. List Accessible Films
  const userOneFilms = await tenants.listAccessibleFilms(userOne);
  if (userOneFilms.length !== 1 || userOneFilms[0]?.title !== 'Sankalp: The Resolution') {
    throw new Error('Created film was not found in accessible list.');
  }
  if (userOneFilms[0]?.status !== 'active') {
    throw new Error('Newly created film is not in active status.');
  }

  // 3. Get Single Film Details
  const filmDetails = await tenants.getFilm(userOne, createdFilm.id);
  if (filmDetails.title !== 'Sankalp: The Resolution' || filmDetails.status !== 'active') {
    throw new Error('Get film returned mismatched details.');
  }

  // 4. Archive Film
  await tenants.archiveFilm(context(userOne), createdFilm.id);
  const archivedDetails = await tenants.getFilm(userOne, createdFilm.id);
  if (archivedDetails.status !== 'archived') {
    throw new Error('Film status did not transition to archived.');
  }

  // Verify audit event for archive
  const archiveAudit = await pool.query(
    `SELECT action, outcome, target_type FROM audit_events
     WHERE film_id = $1 AND action = 'film.archive'`,
    [createdFilm.id],
  );
  if (archiveAudit.rows.length === 0 || archiveAudit.rows[0]?.outcome !== 'success') {
    throw new Error('Archive audit event was not recorded.');
  }

  // 5. Restore Film
  await tenants.restoreFilm(context(userOne), createdFilm.id);
  const restoredDetails = await tenants.getFilm(userOne, createdFilm.id);
  if (restoredDetails.status !== 'active') {
    throw new Error('Film status did not transition back to active upon restore.');
  }

  // Verify audit event for restore
  const restoreAudit = await pool.query(
    `SELECT action, outcome, target_type FROM audit_events
     WHERE film_id = $1 AND action = 'film.restore'`,
    [createdFilm.id],
  );
  if (restoreAudit.rows.length === 0 || restoreAudit.rows[0]?.outcome !== 'success') {
    throw new Error('Restore audit event was not recorded.');
  }

  // 6. Create Canonical Screenplay Document in Film
  const docId = randomUUID();
  const createdDoc = await content.createDocument(
    context(userOne),
    createdFilm.id,
    {
      operationId: randomUUID(),
      id: docId,
      title: 'ప్రధాన స్క్రీన్‌ప్లే (Main Screenplay)',
      kind: 'screenplay',
      language: 'te',
    },
  );
  if (createdDoc.title !== 'ప్రధాన స్క్రీన్‌ప్లే (Main Screenplay)' || createdDoc.version !== 1) {
    throw new Error('Screenplay document was not created with canonical version 1.');
  }

  // 7. List Documents
  const docs = await content.listDocuments(context(userOne), createdFilm.id);
  if (docs.length !== 1 || docs[0]?.id !== docId) {
    throw new Error('Document list did not include the created screenplay.');
  }

  // 8. Cross-Tenant Isolation: User Two cannot access User One's Film or Documents
  await expectError(
    tenants.getFilm(userTwo, createdFilm.id),
    ['FILM_NOT_FOUND', 'ROW_LEVEL_SECURITY'],
  );

  await expectError(
    tenants.archiveFilm(context(userTwo), createdFilm.id),
    ['FILM_PERMISSION_DENIED', 'FILM_NOT_FOUND'],
  );

  await expectError(
    content.listDocuments(context(userTwo), createdFilm.id),
    ['FILM_PERMISSION_DENIED', 'FILM_NOT_FOUND'],
  );

  // 9. Localization & Accessibility Baseline
  if (supportedLocales.length !== 8) {
    throw new Error('Did not support all 8 required application languages.');
  }
  for (const loc of supportedLocales) {
    const t = getTranslations(loc);
    if (!t.app.title || !t.projects.createProject || !t.documents.createDocument) {
      throw new Error(`Incomplete translations for locale ${loc}`);
    }
  }

  await pool.end();
  process.stdout.write(
    'Web shell and real project workflows verified: project creation, active/archive lifecycle, restore, document creation, audit logging, cross-tenant isolation, and 8-language localization baseline.\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
