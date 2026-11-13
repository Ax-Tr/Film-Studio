import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Controller('me')
@UseGuards(SessionAuthGuard)
export class MeController {
  @Get('session')
  getSession(@Req() request: AuthenticatedRequest) {
    return request.principal;
  }
}
