import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresFilesJobsRepository } from '../apps/api/src/database/postgres-files-jobs.repository.js';
import { executeJobWithRecovery, redactTelemetry, type JobExecution } from '@film-studio/jobs';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

async function main(): Promise<void> {
  const database = new PGlite();
  const migrationDirectory = fileURLToPath(
    new URL('../infra/database/migrations/', import.meta.url),
  );
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();

  try {
    for (const name of migrationNames) {
      await database.exec(
        await readFile(
          new URL(`../infra/database/migrations/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }

    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Files User One', 'files-one@example.test'),
        ('${userTwo}', 'Files User Two', 'files-two@example.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Files Org One');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Files Film One');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Files Org Two');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Files Film Two');

      -- Set small storage quota on filmOne (50 MB) for testing
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '${filmOne}', false);

      INSERT INTO film_quotas (film_id, max_storage_bytes, used_storage_bytes)
      VALUES ('${filmOne}', 52428800, 0)
      ON CONFLICT (film_id) DO UPDATE SET max_storage_bytes = 52428800, used_storage_bytes = 0;

      CREATE ROLE app_files_jobs_runtime NOLOGIN NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public, app_security TO app_files_jobs_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        films, film_quotas, files, background_jobs,
        users, film_memberships, role_permissions, roles TO app_files_jobs_runtime;
    `);

    const pool = new Pool({
      ...(createPgConfig(database) as unknown as Record<string, unknown>),
      max: 1,
    });

    try {
      await pool.query('SET ROLE app_files_jobs_runtime');
      const repository = new PostgresFilesJobsRepository(pool);

      // 1. Authorized private file creation & quota tracking
      const file1 = await repository.createFile(userOne, filmOne, {
        fileName: 'Screenplay_Draft_Telugu.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10485760, // 10 MB
        sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      if (file1.fileName !== 'Screenplay_Draft_Telugu.pdf' || file1.status !== 'pending') {
        throw new Error(`File 1 creation failed: ${JSON.stringify(file1)}`);
      }

      // 2. Quota enforcement: attempt to exceed 50 MB total quota
      let quotaExceeded = false;
      try {
        await repository.createFile(userOne, filmOne, {
          fileName: 'Gigantic_Video_Asset.mov',
          mimeType: 'video/quicktime',
          sizeBytes: 50000000, // 50 MB + prior 10 MB > 50 MB quota!
          sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        });
      } catch (error) {
        if (
          error instanceof Error &&
          ('code' in error && (error as { code: string }).code === 'STORAGE_QUOTA_EXCEEDED')
        ) {
          quotaExceeded = true;
        }
      }
      if (!quotaExceeded) {
        throw new Error('Expected STORAGE_QUOTA_EXCEEDED on file exceeding quota');
      }

      // 3. File status progression & malware scanning hook
      // Test A: Clean scan -> status becomes 'ready'
      const scannedReady = await repository.updateFileStatus(userOne, filmOne, file1.id, 'ready');
      if (scannedReady.status !== 'ready') {
        throw new Error('File scan update to ready failed');
      }

      // Test B: Malicious file -> status becomes 'quarantined'
      const file2 = await repository.createFile(userOne, filmOne, {
        fileName: 'suspicious_payload.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024,
        sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      const quarantined = await repository.updateFileStatus(
        userOne,
        filmOne,
        file2.id,
        'quarantined',
        'Signature matches macro exploit heuristic',
      );
      if (quarantined.status !== 'quarantined' || !quarantined.quarantineReason) {
        throw new Error('Quarantine update failed');
      }

      // 4. Background Job creation with idempotency key deduplication
      const job1 = await repository.createJob(userOne, filmOne, {
        queueName: 'exports',
        jobType: 'screenplay.pdf.export',
        idempotencyKey: 'export-film-one-draft-1',
        payload: { documentId: 'doc-001', preset: 'telugu_industry' },
      });
      if (job1.status !== 'queued') {
        throw new Error('Job creation failed');
      }

      // Retry with same idempotency key returns identical job
      const job1Retry = await repository.createJob(userOne, filmOne, {
        queueName: 'exports',
        jobType: 'screenplay.pdf.export',
        idempotencyKey: 'export-film-one-draft-1',
        payload: { documentId: 'doc-001', preset: 'telugu_industry' },
      });
      if (job1Retry.id !== job1.id) {
        throw new Error('Idempotent job retry returned different job ID');
      }

      // 5. Poison Job recovery with execution runner
      const executionJob: JobExecution = {
        id: job1.id,
        filmId: filmOne,
        queueName: 'exports',
        jobType: 'screenplay.pdf.export',
        attemptCount: 2, // Reaching maxAttempts (3)
        maxAttempts: 3,
        payload: { testPoison: true },
      };

      const executionResult = await executeJobWithRecovery(executionJob, async () => {
        throw new Error('Crash in renderer: corrupted font table');
      });

      if (executionResult.status !== 'dead_letter') {
        throw new Error(`Expected dead_letter on poison job, got: ${executionResult.status}`);
      }

      // Update in database to dead_letter
      const deadLetterJob = await repository.updateJobExecution(userOne, filmOne, job1.id, {
        status: 'dead_letter',
        errorCode: executionResult.errorCode,
        errorMessage: executionResult.errorMessage,
        incrementAttempt: true,
      });
      if (deadLetterJob.status !== 'dead_letter' || deadLetterJob.attemptCount !== 1) {
        throw new Error('Database dead letter update failed');
      }

      // 6. Telemetry Content Redaction
      const telemetryPayload = {
        filmId: filmOne,
        scriptContent: 'EXT. AMARAVATI - NIGHT\nHero arrives with courage.',
        dialogue: 'రండి చూద్దాం!',
        apiKey: 'sk-secret-key-abcdef',
        userPassword: 'plaintext-secret',
        metadata: {
          publicInfo: 'Telugu Literary Preset',
          prompt: 'Refine dialogue for historical tone',
        },
      };

      const redacted = redactTelemetry(telemetryPayload);
      if (
        redacted.scriptContent !== '[REDACTED]' ||
        redacted.dialogue !== '[REDACTED]' ||
        redacted.apiKey !== '[REDACTED]' ||
        redacted.userPassword !== '[REDACTED]' ||
        redacted.metadata.prompt !== '[REDACTED]' ||
        redacted.metadata.publicInfo !== 'Telugu Literary Preset'
      ) {
        throw new Error(`Telemetry redaction failed: ${JSON.stringify(redacted)}`);
      }

      // 7. Cross-film tenant isolation (RLS negative checks)
      const crossFile = await repository.findFile(userTwo, filmOne, file1.id);
      if (crossFile !== null) {
        throw new Error('Tenant leak: userTwo from filmTwo was able to read filmOne file!');
      }

      const crossJob = await repository.findJob(userTwo, filmOne, job1.id);
      if (crossJob !== null) {
        throw new Error('Tenant leak: userTwo from filmTwo was able to read filmOne job!');
      }

      process.stdout.write(
        'Files, jobs, and observability verified: private storage, quota enforcement, malware quarantine, job idempotency, poison job recovery, telemetry redaction, and tenant isolation.\n',
      );
    } finally {
      await pool.end();
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

