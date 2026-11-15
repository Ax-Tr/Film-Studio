import { evaluateFilmPermission } from '@film-studio/domain';
import type { AuthorizationRepository } from './authorization.repository.js';

export class FilmPermissionDeniedError extends Error {
  readonly code = 'FILM_PERMISSION_DENIED';

  constructor(readonly reason: string) {
    super('Film permission was denied.');
  }
}

export class PermissionService {
  constructor(private readonly repository: AuthorizationRepository) {}

  async requireFilmPermission(
    userId: string,
    sessionId: string,
    filmId: string,
    permission: string,
  ): Promise<void> {
    const snapshot = await this.repository.loadFilmAccess(
      userId,
      sessionId,
      filmId,
    );
    const decision = evaluateFilmPermission(snapshot, permission);
    if (!decision.allowed) throw new FilmPermissionDeniedError(decision.reason);
  }
}
