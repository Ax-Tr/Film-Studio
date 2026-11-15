import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  acceptFilmInvitationRequestSchema,
  createFilmInvitationRequestSchema,
  createFilmRequestSchema,
  createOrganizationRequestSchema,
} from '@film-studio/contracts';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { MutationContext, TenantService } from './tenant.service.js';
import { TENANT_SERVICE } from './tenant.tokens.js';

const uuidSchema = z.string().uuid();

@Controller()
@UseGuards(SessionAuthGuard)
export class TenantController {
  constructor(
    @Inject(TENANT_SERVICE) private readonly tenants: TenantService,
  ) {}

  @Post('organizations')
  createOrganization(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = createOrganizationRequestSchema.parse(body);
    return this.tenants.createOrganization(this.context(request), input.name);
  }

  @Post('organizations/:organizationId/films')
  createFilm(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    const input = createFilmRequestSchema.parse(body);
    return this.tenants.createFilm(
      this.context(request),
      uuidSchema.parse(organizationId),
      input.title,
    );
  }

  @Get('films')
  listFilms(@Req() request: AuthenticatedRequest) {
    return this.tenants.listAccessibleFilms(this.principal(request).userId);
  }

  @Get('films/:filmId')
  getFilm(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.tenants.getFilm(
      this.principal(request).userId,
      uuidSchema.parse(filmId),
    );
  }

  @Post('films/:filmId/archive')
  archiveFilm(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.tenants.archiveFilm(
      this.context(request),
      uuidSchema.parse(filmId),
    );
  }

  @Post('films/:filmId/restore')
  restoreFilm(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.tenants.restoreFilm(
      this.context(request),
      uuidSchema.parse(filmId),
    );
  }

  @Post('films/:filmId/invitations')
  inviteMember(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Body() body: unknown,
  ) {
    const input = createFilmInvitationRequestSchema.parse(body);
    return this.tenants.inviteMember(
      this.context(request),
      uuidSchema.parse(filmId),
      {
        email: input.email,
        roleIds: input.roleIds,
        expiresAt: new Date(input.expiresAt),
      },
    );
  }

  @Post('film-invitations/accept')
  acceptInvitation(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = acceptFilmInvitationRequestSchema.parse(body);
    return this.tenants.acceptInvitation(this.context(request), input.token);
  }

  private context(request: AuthenticatedRequest): MutationContext {
    const principal = this.principal(request);
    const suppliedRequestId = request.header('x-request-id');
    const requestId =
      suppliedRequestId !== undefined &&
      /^[A-Za-z0-9._-]{8,128}$/u.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    const userAgent = request.header('user-agent');
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      requestId,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    };
  }

  private principal(request: AuthenticatedRequest) {
    if (request.principal === undefined) {
      throw new Error('Authenticated principal was not attached by the guard.');
    }
    return request.principal;
  }
}
