import { describe, expect, it } from 'vitest';
import { serviceStatusSchema } from '@film-studio/contracts';
import { HealthController } from '../src/health.controller.js';

describe('HealthController', () => {
  it('returns the public service status contract', () => {
    const status = new HealthController().getHealth();
    expect(serviceStatusSchema.parse(status)).toEqual(status);
  });
});
