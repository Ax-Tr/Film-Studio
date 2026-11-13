import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createDocumentRequestSchema,
  createDocumentVersionRequestSchema,
  createSceneRequestSchema,
  deleteSceneRequestSchema,
  moveSceneRequestSchema,
  restoreSceneRequestSchema,
  updateDocumentRequestSchema,
} from '@film-studio/contracts';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type { ContentService } from './content.service.js';
import { CONTENT_SERVICE } from './content.tokens.js';

const uuidSchema = z.string().uuid();

@Controller('films/:filmId/documents')
@UseGuards(SessionAuthGuard)
export class ContentController {
  constructor(
    @Inject(CONTENT_SERVICE) private readonly content: ContentService,
  ) {}

  @Post()
  createDocument(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Body() body: unknown,
  ) {
    return this.content.createDocument(
      this.context(request),
      uuidSchema.parse(filmId),
      createDocumentRequestSchema.parse(body),
    );
  }

  @Get()
  listDocuments(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.content.listDocuments(
      this.context(request),
      uuidSchema.parse(filmId),
    );
  }

  @Get(':documentId')
  getDocument(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.content.getDocument(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
    );
  }

  @Patch(':documentId')
  updateDocument(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.content.updateDocument(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      updateDocumentRequestSchema.parse(body),
    );
  }

  @Post(':documentId/versions')
  createDocumentVersion(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.content.createDocumentVersion(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      createDocumentVersionRequestSchema.parse(body),
    );
  }

  @Get(':documentId/scenes')
  listScenes(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.content.listScenes(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      includeDeleted === 'true',
    );
  }

  @Post(':documentId/scenes')
  createScene(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.content.createScene(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      createSceneRequestSchema.parse(body),
    );
  }

  @Post(':documentId/scenes/:sceneId/move')
  moveScene(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    return this.content.moveScene(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      uuidSchema.parse(sceneId),
      moveSceneRequestSchema.parse(body),
    );
  }

  @Delete(':documentId/scenes/:sceneId')
  deleteScene(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    return this.content.deleteScene(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      uuidSchema.parse(sceneId),
      deleteSceneRequestSchema.parse(body),
    );
  }

  @Post(':documentId/scenes/:sceneId/restore')
  restoreScene(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    return this.content.restoreScene(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      uuidSchema.parse(sceneId),
      restoreSceneRequestSchema.parse(body),
    );
  }

  private context(request: AuthenticatedRequest): MutationContext {
    if (request.principal === undefined) {
      throw new Error('Authenticated principal was not attached by the guard.');
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
