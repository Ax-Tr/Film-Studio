import type { FilmAccessSnapshot } from '@film-studio/domain';

export interface AuthorizationRepository {
  loadFilmAccess(
    userId: string,
    sessionId: string,
    filmId: string,
  ): Promise<FilmAccessSnapshot>;
}
