import type { ServiceStatus } from '@film-studio/contracts';

export const queueNames = {
  exports: 'exports',
  imports: 'imports',
  notifications: 'notifications',
  aiProposals: 'ai-proposals',
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export function workerStatus(now = new Date()): ServiceStatus {
  return {
    service: 'worker',
    status: 'ok',
    version: '0.0.0',
    timestamp: now.toISOString(),
  };
}

export interface JobExecution<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly filmId: string;
  readonly queueName: QueueName;
  readonly jobType: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly payload: TPayload;
}

export interface JobExecutionResult {
  readonly status: 'completed' | 'retry' | 'dead_letter';
  readonly result?: Record<string, unknown>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly nextRunAt?: string;
}

const sensitiveKeyPattern =
  /(auth|content|dialogue|email|key|password|prompt|script|secret|token)/iu;

export function redactTelemetry<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactTelemetry(item)) as unknown as T;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      redacted[key] = redactTelemetry(val);
    } else {
      redacted[key] = val;
    }
  }
  return redacted as T;
}

export async function executeJobWithRecovery<TPayload>(
  job: JobExecution<TPayload>,
  handler: (payload: TPayload) => Promise<Record<string, unknown>>,
): Promise<JobExecutionResult> {
  try {
    const result = await handler(job.payload);
    return {
      status: 'completed',
      result,
    };
  } catch (error) {
    const currentAttempt = job.attemptCount + 1;
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'JOB_EXECUTION_FAILED';
    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    const errorMessage = sensitiveKeyPattern.test(rawErrorMessage)
      ? '[REDACTED_ERROR_MESSAGE]'
      : rawErrorMessage;

    if (currentAttempt >= job.maxAttempts) {
      // Poison job recovery: dead-letter without crashing worker
      return {
        status: 'dead_letter',
        errorCode,
        errorMessage,
      };
    }

    // Schedule retry with exponential backoff: 2^attempt * 1000ms
    const delayMs = Math.pow(2, currentAttempt) * 1000;
    const nextRunAt = new Date(Date.now() + delayMs).toISOString();

    return {
      status: 'retry',
      errorCode,
      errorMessage,
      nextRunAt,
    };
  }
}
