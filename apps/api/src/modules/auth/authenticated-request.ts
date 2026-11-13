import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@film-studio/contracts';

export interface AuthenticatedRequest extends Request {
  principal?: AuthenticatedPrincipal;
}
