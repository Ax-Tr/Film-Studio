import { describe, expect, it } from 'vitest';
import { serviceStatusSchema } from '@film-studio/contracts';
import { HealthController } from '../src/health.controller.js';

describe('HealthController', () => {
  it('returns the public service status contract', () => {
    const status = new HealthController().getHealth();
    expect(serviceStatusSchema.parse(status)).toEqual(status);
  });

  it('returns the readiness status contract', async () => {
    const readiness = await new HealthController().getReadiness();
    expect(readiness.status).toBe('ok');
    expect(readiness.database).toBe(true);
  });
});
