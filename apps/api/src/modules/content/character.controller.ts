import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createCharacterSchema,
  updateCharacterSchema,
  reorderScenesSchema,
  lockSceneSchema,
} from '@film-studio/contracts';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { MutationContext } from '../tenant/tenant.service.js';
import type { CharacterService } from './character.service.js';

const uuidSchema = z.string().uuid();

@Controller('films/:filmId')
@UseGuards(SessionAuthGuard)
export class CharacterController {
  constructor(private readonly characters: CharacterService) {}

  @Post('characters')
  createCharacter(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Body() body: unknown,
  ) {
    return this.characters.createCharacter(
      this.context(request),
      uuidSchema.parse(filmId),
      createCharacterSchema.parse(body),
    );
  }

  @Get('characters')
  listCharacters(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
  ) {
    return this.characters.listCharacters(
      this.context(request),
      uuidSchema.parse(filmId),
    );
  }

  @Get('characters/:characterId')
  getCharacter(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('characterId') characterId: string,
  ) {
    return this.characters.getCharacter(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(characterId),
    );
  }

  @Patch('characters/:characterId')
  updateCharacter(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('characterId') characterId: string,
    @Body() body: unknown,
  ) {
    return this.characters.updateCharacter(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(characterId),
      updateCharacterSchema.parse(body),
    );
  }

  @Delete('characters/:characterId')
  deleteCharacter(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('characterId') characterId: string,
  ) {
    return this.characters.deleteCharacter(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(characterId),
    );
  }

  @Post('characters/:characterId/relationships')
  addRelationship(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('characterId') characterId: string,
    @Body() body: { targetCharacterId: string; relationshipType: string; description?: string },
  ) {
    return this.characters.addRelationship(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(characterId),
      uuidSchema.parse(body.targetCharacterId),
      body.relationshipType,
      body.description,
    );
  }

  @Get('characters/:characterId/relationships')
  listCharacterRelationships(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('characterId') characterId: string,
  ) {
    return this.characters.listRelationships(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(characterId),
    );
  }

  @Get('documents/:documentId/scene-cards')
  listSceneCards(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.characters.listSceneCards(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
    );
  }

  @Put('documents/:documentId/scenes/reorder')
  reorderScenes(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    const parsed = reorderScenesSchema.parse(body);
    return this.characters.reorderScenes(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      parsed.sceneIdsInOrder,
    );
  }

  @Patch('documents/:documentId/scenes/:sceneId/metadata')
  updateSceneMetadata(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: {
      slugline?: string;
      timeOfDay?: string;
      settingLocation?: string;
      summary?: string;
    },
  ) {
    return this.characters.updateSceneMetadata(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      uuidSchema.parse(sceneId),
      body,
    );
  }

  @Post('documents/:documentId/scenes/:sceneId/lock')
  lockScene(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Param('documentId') documentId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const parsed = lockSceneSchema.parse(body);
    return this.characters.lockScene(
      this.context(request),
      uuidSchema.parse(filmId),
      uuidSchema.parse(documentId),
      uuidSchema.parse(sceneId),
      parsed.lock,
    );
  }

  @Get('search')
  globalSearch(
    @Req() request: AuthenticatedRequest,
    @Param('filmId') filmId: string,
    @Query('q') query: string,
  ) {
    return this.characters.globalSearch(
      this.context(request),
      uuidSchema.parse(filmId),
      query ?? '',
    );
  }

  private context(request: AuthenticatedRequest): MutationContext {
    if (request.principal === undefined) {
      throw new Error('Principal was not attached.');
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
