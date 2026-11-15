import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';

interface CodedError extends Error {
  readonly code?: string;
}

const safeErrors: Record<
  string,
  { status: number; message: string; retryable: boolean }
> = {
  INVALID_SESSION_TOKEN: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'The session is invalid or expired.',
    retryable: false,
  },
  REFRESH_TOKEN_REPLAY: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'The session was revoked for security.',
    retryable: false,
  },
  INVALID_OIDC_TRANSACTION: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The sign-in transaction is invalid or expired.',
    retryable: false,
  },
  ACCOUNT_UNAVAILABLE: {
    status: HttpStatus.FORBIDDEN,
    message: 'This account or device is unavailable.',
    retryable: false,
  },
  FILM_PERMISSION_DENIED: {
    status: HttpStatus.FORBIDDEN,
    message: 'You do not have permission for this film action.',
    retryable: false,
  },
  CSRF_ORIGIN_MISMATCH: {
    status: HttpStatus.FORBIDDEN,
    message: 'The request origin is not allowed.',
    retryable: false,
  },
  INVALID_INVITATION_EXPIRY: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The invitation expiry must be in the future.',
    retryable: false,
  },
  INVALID_FILM_INVITATION: {
    status: HttpStatus.BAD_REQUEST,
    message:
      'The film invitation is invalid, expired, or not assigned to this identity.',
    retryable: false,
  },
  FILM_INVITATION_ALREADY_PENDING: {
    status: HttpStatus.CONFLICT,
    message: 'A pending invitation already exists for this film and email.',
    retryable: false,
  },
  ORGANIZATION_PERMISSION_DENIED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Organization administration permission is required.',
    retryable: false,
  },
  MODEL_RESOURCE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'The requested film resource was not found.',
    retryable: false,
  },
  MODEL_VERSION_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'The resource changed after the submitted version.',
    retryable: false,
  },
  MODEL_OPERATION_REUSED: {
    status: HttpStatus.CONFLICT,
    message: 'The operation identifier was already used for different input.',
    retryable: false,
  },
  MODEL_ID_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'The client-generated identifier is already in use.',
    retryable: false,
  },
  MODEL_INDEX_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The requested position is outside the document order.',
    retryable: false,
  },
  MODEL_SNAPSHOT_MISMATCH: {
    status: HttpStatus.CONFLICT,
    message: 'The snapshot does not match the current document scene order.',
    retryable: false,
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = this.requestId(request);
    response.setHeader('X-Request-Id', requestId);

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'VALIDATION_FAILED',
        message: 'The request did not match the required format.',
        requestId,
        retryable: false,
      });
      return;
    }

    const coded =
      exception instanceof Error ? (exception as CodedError) : undefined;
    const safe = coded?.code === undefined ? undefined : safeErrors[coded.code];
    if (safe !== undefined && coded?.code !== undefined) {
      response.status(safe.status).json({
        code: coded.code,
        message: safe.message,
        requestId,
        retryable: safe.retryable,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        code:
          status === HttpStatus.NOT_FOUND
            ? 'RESOURCE_NOT_FOUND'
            : 'REQUEST_REJECTED',
        message:
          status === HttpStatus.NOT_FOUND
            ? 'The requested resource was not found.'
            : 'The request was rejected.',
        requestId,
        retryable: false,
      });
      return;
    }

    console.error('Unhandled API error', {
      requestId,
      errorName: coded?.name ?? 'UnknownError',
      message: coded?.message,
      stack: coded?.stack,
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
      requestId,
      retryable: false,
    });
  }

  private requestId(request: Request): string {
    const header = request.header('x-request-id');
    return header !== undefined && /^[A-Za-z0-9._-]{8,128}$/u.test(header)
      ? header
      : randomUUID();
  }
}
