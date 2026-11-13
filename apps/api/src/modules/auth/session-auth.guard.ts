import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AppEnvironment } from '@film-studio/contracts';
import {
  InvalidSessionTokenError,
  type SessionService,
} from './session.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { AUTH_ENVIRONMENT, SESSION_SERVICE } from './auth.tokens.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_ENVIRONMENT) private readonly environment: AppEnvironment,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = this.bearerToken(request.header('authorization'));
    const cookie = this.accessCookie(request);
    if (bearer !== undefined && cookie !== undefined && bearer !== cookie) {
      throw new InvalidSessionTokenError();
    }
    const token = bearer ?? cookie;
    if (token === undefined) throw new InvalidSessionTokenError();
    if (bearer === undefined && cookie !== undefined) {
      this.assertSafeCookieRequest(request);
    }
    request.principal = await this.sessions.authenticate(token);
    return true;
  }

  private bearerToken(header: string | undefined): string | undefined {
    if (header === undefined) return undefined;
    const match = /^Bearer ([A-Za-z0-9_-]{32,})$/u.exec(header);
    return match?.[1];
  }

  private accessCookie(request: AuthenticatedRequest): string | undefined {
    const name = `${this.environment.SESSION_COOKIE_SECURE ? '__Host-' : ''}film_access`;
    const value = (request.cookies as Record<string, unknown> | undefined)?.[
      name
    ];
    return typeof value === 'string' ? value : undefined;
  }

  private assertSafeCookieRequest(request: AuthenticatedRequest): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()))
      return;
    const webAppUrl = this.environment.WEB_APP_URL;
    if (
      webAppUrl === undefined ||
      request.header('origin') !== new URL(webAppUrl).origin
    ) {
      const error = new Error('The request origin is not allowed.') as Error & {
        code: string;
      };
      error.code = 'CSRF_ORIGIN_MISMATCH';
      throw error;
    }
  }
}
