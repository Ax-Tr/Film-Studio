import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AppEnvironment } from '@film-studio/contracts';
import { refreshSessionRequestSchema } from '@film-studio/contracts';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthFlowService } from './auth-flow.service.js';
import type { SessionService } from './session.service.js';
import { AUTH_ENVIRONMENT, AUTH_FLOW, SESSION_SERVICE } from './auth.tokens.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SessionAuthGuard } from './session-auth.guard.js';

const mobileStartSchema = z.object({ platform: z.enum(['android', 'ios']) });
const mobileCompleteSchema = z.object({
  callbackUrl: z.string().url(),
  binding: z.string().min(32),
  deviceId: z.string().uuid(),
});
const uuidSchema = z.string().uuid();

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_FLOW) private readonly authFlow: AuthFlowService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_ENVIRONMENT) private readonly environment: AppEnvironment,
    private readonly audit: AuditService,
  ) {}

  @Get('web/start')
  async startWeb(@Req() request: Request, @Res() response: Response) {
    const deviceId = this.deviceId(request);
    const started = await this.authFlow.start(
      'web',
      this.required(this.environment.OIDC_WEB_REDIRECT_URI),
    );
    response.cookie(this.cookieName('oidc'), started.binding, {
      ...this.cookieOptions(),
      maxAge: Math.max(1, started.expiresAt.getTime() - Date.now()),
    });
    response.cookie(this.cookieName('device'), deviceId, {
      ...this.cookieOptions(),
      maxAge: 31_536_000_000,
    });
    response.redirect(302, started.authorizationUrl.href);
  }

  @Get('web/callback')
  async completeWeb(
    @Query('state') _state: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const redirectUri = this.required(this.environment.OIDC_WEB_REDIRECT_URI);
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(
      request.originalUrl,
      'https://callback.invalid',
    ).search;
    const binding = this.requiredCookie(request, this.cookieName('oidc'));
    const issued = await this.authFlow.complete(
      callbackUrl,
      binding,
      this.deviceId(request),
    );
    await this.recordSessionEvent(request, issued.principal, 'auth.login');
    this.setSessionCookies(response, issued.tokens);
    response.clearCookie(this.cookieName('oidc'), this.cookieOptions());
    response.redirect(
      303,
      new URL('/auth/complete', this.required(this.environment.WEB_APP_URL))
        .href,
    );
  }

  @Post('web/refresh')
  async refreshWeb(@Req() request: Request, @Res() response: Response) {
    this.assertTrustedOrigin(request);
    const refreshToken = this.requiredCookie(
      request,
      this.cookieName('refresh'),
    );
    const issued = await this.sessions.refresh(refreshToken);
    await this.recordSessionEvent(
      request,
      issued.principal,
      'auth.session.refresh',
    );
    this.setSessionCookies(response, issued.tokens);
    response.status(204).send();
  }

  @Post('web/logout')
  @HttpCode(204)
  async logoutWeb(@Req() request: Request, @Res() response: Response) {
    this.assertTrustedOrigin(request);
    const accessToken = this.requiredCookie(request, this.cookieName('access'));
    const principal = await this.sessions.authenticate(accessToken);
    await this.sessions.revoke(principal.sessionId, 'user_logout');
    this.clearSessionCookies(response);
    await this.recordSessionEvent(request, principal, 'auth.logout');
    response.status(204).send();
  }

  @Post('mobile/start')
  async startMobile(@Body() input: unknown) {
    const request = mobileStartSchema.parse(input);
    const redirectUri =
      request.platform === 'android'
        ? this.required(this.environment.OIDC_ANDROID_REDIRECT_URI)
        : this.required(this.environment.OIDC_IOS_REDIRECT_URI);
    const started = await this.authFlow.start(request.platform, redirectUri);
    return {
      authorizationUrl: started.authorizationUrl.href,
      binding: started.binding,
      expiresAt: started.expiresAt.toISOString(),
    };
  }

  @Post('mobile/complete')
  async completeMobile(@Body() input: unknown, @Req() request: Request) {
    const payload = mobileCompleteSchema.parse(input);
    const issued = await this.authFlow.complete(
      new URL(payload.callbackUrl),
      payload.binding,
      payload.deviceId,
    );
    await this.recordSessionEvent(request, issued.principal, 'auth.login');
    return issued.tokens;
  }

  @Post('mobile/refresh')
  async refreshMobile(@Body() input: unknown, @Req() request: Request) {
    const payload = refreshSessionRequestSchema.parse(input);
    const issued = await this.sessions.refresh(payload.refreshToken);
    await this.recordSessionEvent(
      request,
      issued.principal,
      'auth.session.refresh',
    );
    return issued.tokens;
  }

  @Post('mobile/logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async logoutMobile(@Req() request: AuthenticatedRequest) {
    if (request.principal === undefined) return;
    await this.sessions.revoke(request.principal.sessionId, 'user_logout');
    await this.recordSessionEvent(request, request.principal, 'auth.logout');
  }

  private setSessionCookies(
    response: Response,
    tokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    },
  ): void {
    response.cookie(this.cookieName('access'), tokens.accessToken, {
      ...this.cookieOptions(),
      expires: new Date(tokens.accessTokenExpiresAt),
    });
    response.cookie(this.cookieName('refresh'), tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: new Date(tokens.refreshTokenExpiresAt),
    });
  }

  private clearSessionCookies(response: Response): void {
    response.clearCookie(this.cookieName('access'), this.cookieOptions());
    response.clearCookie(this.cookieName('refresh'), this.cookieOptions());
  }

  private deviceId(request: Request): string {
    const existing = (request.cookies as Record<string, unknown> | undefined)?.[
      this.cookieName('device')
    ];
    return typeof existing === 'string' &&
      uuidSchema.safeParse(existing).success
      ? existing
      : randomUUID();
  }

  private requiredCookie(request: Request, name: string): string {
    const value = (request.cookies as Record<string, unknown> | undefined)?.[
      name
    ];
    if (typeof value !== 'string' || value.length < 1) {
      throw new Error(`Required ${name} cookie is missing.`);
    }
    return value;
  }

  private cookieName(suffix: string): string {
    return `${this.environment.SESSION_COOKIE_SECURE ? '__Host-' : ''}film_${suffix}`;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      path: '/',
      sameSite: 'lax' as const,
      secure: this.environment.SESSION_COOKIE_SECURE,
    };
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.header('origin');
    const expectedOrigin = new URL(this.required(this.environment.WEB_APP_URL))
      .origin;
    if (origin !== expectedOrigin) {
      const error = new Error('The request origin is not allowed.') as Error & {
        code: string;
      };
      error.code = 'CSRF_ORIGIN_MISMATCH';
      throw error;
    }
  }

  private required(value: string | undefined): string {
    if (value === undefined)
      throw new Error('Required identity configuration is absent.');
    return value;
  }

  private async recordSessionEvent(
    request: Request,
    principal: {
      readonly userId: string;
      readonly sessionId: string;
      readonly deviceId: string;
    },
    action: 'auth.login' | 'auth.logout' | 'auth.session.refresh',
  ): Promise<void> {
    const suppliedRequestId = request.header('x-request-id');
    const userAgent = request.header('user-agent');
    try {
      await this.audit.record({
        actorUserId: principal.userId,
        actorSessionId: principal.sessionId,
        action,
        outcome: 'success',
        targetType: 'device',
        targetId: principal.deviceId,
        requestId:
          suppliedRequestId !== undefined &&
          /^[A-Za-z0-9._-]{8,128}$/u.test(suppliedRequestId)
            ? suppliedRequestId
            : randomUUID(),
        ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
        ...(userAgent === undefined ? {} : { userAgent }),
      });
    } catch (error) {
      if (action !== 'auth.logout') {
        await this.sessions.revoke(principal.sessionId, 'admin_security');
      }
      throw error;
    }
  }
}
