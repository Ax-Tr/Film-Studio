export interface AccessibleFilm {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly status: string;
  readonly permissionRevision: string;
}

export interface CreateInvitationRecord {
  readonly id: string;
  readonly filmId: string;
  readonly email: string;
  readonly tokenHash: Uint8Array;
  readonly roleIds: readonly string[];
  readonly expiresAt: Date;
  readonly invitedBy: string;
}

export interface TenantRepository {
  createOrganization(
    userId: string,
    organizationId: string,
    name: string,
  ): Promise<void>;
  createFilm(
    userId: string,
    organizationId: string,
    filmId: string,
    title: string,
  ): Promise<void>;
  listAccessibleFilms(userId: string): Promise<readonly AccessibleFilm[]>;
  createInvitation(input: CreateInvitationRecord): Promise<void>;
  acceptInvitation(userId: string, tokenHash: Uint8Array): Promise<string>;
}
