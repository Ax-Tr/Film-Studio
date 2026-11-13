import type { ServiceStatus } from '@film-studio/contracts';

export const queueNames = {
  exports: 'exports',
  imports: 'imports',
  notifications: 'notifications',
  aiProposals: 'ai-proposals',
} as const;

export function workerStatus(now = new Date()): ServiceStatus {
  return {
    service: 'worker',
    status: 'ok',
    version: '0.0.0',
    timestamp: now.toISOString(),
  };
}
