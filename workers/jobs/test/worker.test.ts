import { describe, expect, it } from 'vitest';
import { serviceStatusSchema } from '@film-studio/contracts';
import {
  executeJobWithRecovery,
  queueNames,
  redactTelemetry,
  workerStatus,
  type JobExecution,
} from '../src/index.js';

describe('worker foundation', () => {
  it('publishes stable queue names', () => {
    expect(new Set(Object.values(queueNames)).size).toBe(4);
  });

  it('returns the shared health contract', () => {
    const status = workerStatus(new Date('2026-11-13T00:00:00.000Z'));
    expect(serviceStatusSchema.parse(status)).toEqual(status);
  });

  it('redacts sensitive screenplay and credential keys from telemetry', () => {
    const input = {
      filmId: '018f4ce4-b3df-75c9-8d26-424bb512c0cf',
      operation: 'export.generate',
      scriptContent: 'EXT. HYDERABAD PALACE - NIGHT',
      dialogue: 'నమస్కారం, రాజా!',
      apiKey: 'secret-key-12345',
      userToken: 'bearer-token-abc',
      nested: {
        prompt: 'Generate scene outline',
        userEmail: 'writer@example.test',
        safeProperty: 'Telugu Industry Preset',
      },
      list: [{ secretInfo: 'hidden' }, { publicInfo: 'shown' }],
    };

    const redacted = redactTelemetry(input);
    expect(redacted.scriptContent).toBe('[REDACTED]');
    expect(redacted.dialogue).toBe('[REDACTED]');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.userToken).toBe('[REDACTED]');
    expect(redacted.nested.prompt).toBe('[REDACTED]');
    expect(redacted.nested.userEmail).toBe('[REDACTED]');
    expect(redacted.nested.safeProperty).toBe('Telugu Industry Preset');
    expect(redacted.list[0]?.secretInfo).toBe('[REDACTED]');
    expect(redacted.list[1]?.publicInfo).toBe('shown');
  });

  it('handles job execution with automatic retry and exponential backoff', async () => {
    const job: JobExecution = {
      id: 'job-1',
      filmId: '018f4ce4-b3df-75c9-8d26-424bb512c0cf',
      queueName: 'exports',
      jobType: 'screenplay.export',
      attemptCount: 0,
      maxAttempts: 3,
      payload: { documentId: 'doc-1' },
    };

    const result = await executeJobWithRecovery(job, async () => {
      throw new Error('Temporary storage timeout');
    });

    expect(result.status).toBe('retry');
    expect(result.nextRunAt).toBeDefined();
    expect(result.errorMessage).toBe('Temporary storage timeout');
  });

  it('recovers from poison jobs by transitioning to dead_letter without crashing', async () => {
    const poisonJob: JobExecution = {
      id: 'job-poison',
      filmId: '018f4ce4-b3df-75c9-8d26-424bb512c0cf',
      queueName: 'exports',
      jobType: 'screenplay.export',
      attemptCount: 2, // Reached maxAttempts on next try
      maxAttempts: 3,
      payload: { corrupted: true },
    };

    const result = await executeJobWithRecovery(poisonJob, async () => {
      throw new Error('Fatal unrecoverable syntax parse error in secret script');
    });

    expect(result.status).toBe('dead_letter');
    // Notice that error message with secret/script is redacted!
    expect(result.errorMessage).toBe('[REDACTED_ERROR_MESSAGE]');
  });
});
