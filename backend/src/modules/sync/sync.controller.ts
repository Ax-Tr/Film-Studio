import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  acknowledgeSyncRevisionRequestSchema,
  pullSyncOperationsRequestSchema,
  pushSyncOperationsRequestSchema,
  resolveConflictRequestSchema,
} from '@film-studio/contracts';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type { SyncService } from './sync.service.js';
import { SYNC_SERVICE } from './sync.tokens.js';

const uuidSchema = z.string().uuid();

@Controller()
@UseGuards(SessionAuthGuard)
export class SyncController {
  constructor(@Inject(SYNC_SERVICE) private readonly sync: SyncService) {}

  @Post('sync/push')
  @HttpCode(200)
  pushOperations(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = pushSyncOperationsRequestSchema.parse(body);
    return this.sync.pushOperations(
      this.context(request),
      parsed.filmId,
      parsed.operations,
    );
  }

  @Get('sync/pull')
  pullOperations(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    const parsed = pullSyncOperationsRequestSchema.parse(query);
    return this.sync.pullOperations(
      this.context(request),
      parsed.filmId,
      parsed.cursor,
      parsed.limit,
    );
  }

  @Post('sync/ack')
  @HttpCode(204)
  async acknowledgeRevision(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const parsed = acknowledgeSyncRevisionRequestSchema.parse(body);
    await this.sync.acknowledgeRevision(
      this.context(request),
      parsed.filmId,
      parsed.deviceId,
      parsed.serverRevision,
    );
  }

  @Get('films/:filmId/conflicts')
  listConflicts(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.sync.listConflicts(
      this.context(request),
      uuidSchema.parse(filmId),
    );
  }

  @Post('films/:filmId/conflicts/:conflictId/resolve')
  resolveConflict(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('conflictId') conflictId: string,
    @Body() body: unknown,
  ) {
    const parsed = resolveConflictRequestSchema.parse(body);
    return this.sync.resolveConflict(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(conflictId),
      {
        choice: parsed.choice,
        ...(parsed.mergedPayload === undefined
          ? {}
          : { mergedPayload: parsed.mergedPayload }),
      },
    );
  }

  private context(request: AuthenticatedRequest): MutationContext {
    if (request.principal === undefined) {
      throw new Error(
        'Authenticated principal was not attached by the guard.',
      );
    }
    const suppliedRequestId = request.header('x-request-id');
    const userAgent = request.header('user-agent');
    return {
      userId: request.principal.userId,
      sessionId: request.principal.sessionId,
      requestId:
        suppliedRequestId !== undefined &&
        /^[A-Za-z0-9._-]{8,128}$/u.test(suppliedRequestId)
          ? suppliedRequestId
          : randomUUID(),
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    };
  }
}
