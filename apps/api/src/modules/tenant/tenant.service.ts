import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../authorization/permission.service.js';
import type { AccessibleFilm, TenantRepository } from './tenant.repository.js';

export interface MutationContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly sourceIp?: string;
  readonly userAgent?: string;
}

export class InvalidInvitationExpiryError extends Error {
  readonly code = 'INVALID_INVITATION_EXPIRY';
}

export class TenantService {
  constructor(
    private readonly repository: TenantRepository,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async createOrganization(
    context: MutationContext,
    name: string,
  ): Promise<{ id: string; name: string }> {
    const id = randomUUID();
    await this.repository.createOrganization(context.userId, id, name);
    await this.audit.record({
      ...this.auditContext(context),
      organizationId: id,
      action: 'organization.create',
      outcome: 'success',
      targetType: 'organization',
      targetId: id,
    });
    return { id, name };
  }

  async createFilm(
    context: MutationContext,
    organizationId: string,
    title: string,
  ): Promise<{ id: string; organizationId: string; title: string }> {
    const id = randomUUID();
    await this.repository.createFilm(context.userId, organizationId, id, title);
    await this.audit.record({
      ...this.auditContext(context),
      organizationId,
      filmId: id,
      action: 'film.create',
      outcome: 'success',
      targetType: 'film',
      targetId: id,
    });
    return { id, organizationId, title };
  }

  listAccessibleFilms(userId: string): Promise<readonly AccessibleFilm[]> {
    return this.repository.listAccessibleFilms(userId);
  }

  async inviteMember(
    context: MutationContext,
    filmId: string,
    input: {
      readonly email: string;
      readonly roleIds: readonly string[];
      readonly expiresAt: Date;
    },
    now = new Date(),
  ): Promise<{ invitationId: string; token: string; expiresAt: string }> {
    if (input.expiresAt <= now) throw new InvalidInvitationExpiryError();
    await this.permissions.requireFilmPermission(
      context.userId,
      context.sessionId,
      filmId,
      'film.members.manage',
    );
    const invitationId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await this.repository.createInvitation({
      id: invitationId,
      filmId,
      email: input.email,
      tokenHash: this.hash(token),
      roleIds: input.roleIds,
      expiresAt: input.expiresAt,
      invitedBy: context.userId,
    });
    await this.audit.record({
      ...this.auditContext(context),
      filmId,
      action: 'film.member.invite',
      outcome: 'success',
      targetType: 'film_invitation',
      targetId: invitationId,
      metadata: { roleCount: input.roleIds.length },
    });
    return {
      invitationId,
      token,
      expiresAt: input.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    context: MutationContext,
    token: string,
  ): Promise<{ filmId: string }> {
    const filmId = await this.repository.acceptInvitation(
      context.userId,
      this.hash(token),
    );
    await this.audit.record({
      ...this.auditContext(context),
      filmId,
      action: 'film.member.invitation.accept',
      outcome: 'success',
      targetType: 'film',
      targetId: filmId,
    });
    return { filmId };
  }

  private hash(value: string): Uint8Array {
    return createHash('sha256').update(value, 'utf8').digest();
  }

  private auditContext(context: MutationContext) {
    return {
      actorUserId: context.userId,
      actorSessionId: context.sessionId,
      requestId: context.requestId,
      ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
      ...(context.userAgent === undefined
        ? {}
        : { userAgent: context.userAgent }),
    };
  }
}
