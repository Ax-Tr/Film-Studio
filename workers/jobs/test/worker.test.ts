import { describe, expect, it } from 'vitest';
import { serviceStatusSchema } from '@film-studio/contracts';
import { queueNames, workerStatus } from '../src/index.js';

describe('worker foundation', () => {
  it('publishes stable queue names', () => {
    expect(new Set(Object.values(queueNames)).size).toBe(4);
  });

  it('returns the shared health contract', () => {
    const status = workerStatus(new Date('2026-11-13T00:00:00.000Z'));
    expect(serviceStatusSchema.parse(status)).toEqual(status);
  });
});
