import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AuditService,
  type AuditRepository,
} from '../src/modules/audit/audit.service.js';
import { PermissionService } from '../src/modules/authorization/permission.service.js';
import type { AuthorizationRepository } from '../src/modules/authorization/authorization.repository.js';
import {
  InvalidInvitationExpiryError,
  TenantService,
  type MutationContext,
} from '../src/modules/tenant/tenant.service.js';
import type {
  CreateInvitationRecord,
  TenantRepository,
} from '../src/modules/tenant/tenant.repository.js';

const userId = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const sessionId = '018f4ce4-c0e4-7c85-a59c-61f49c1bbb5c';
const filmId = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const roleId = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const now = new Date('2026-11-13T00:00:00.000Z');

const context: MutationContext = {
  userId,
  sessionId,
  requestId: 'request-1234',
};

class FakeTenantRepository implements TenantRepository {
  invitation?: CreateInvitationRecord;
  archived = false;

  async createOrganization(): Promise<void> {}
  async createFilm(): Promise<void> {}
  async listAccessibleFilms() {
    return [];
  }
  async getFilm(_userId: string, targetFilmId: string) {
    return {
      id: targetFilmId,
      organizationId: '018f4ce4-7a86-7f2e-96df-bf4e914f21d4',
      title: 'Test Film',
      status: this.archived ? 'archived' : 'active',
      permissionRevision: '1',
    };
  }
  async archiveFilm(): Promise<void> {
    this.archived = true;
  }
  async restoreFilm(): Promise<void> {
    this.archived = false;
  }
  async createInvitation(input: CreateInvitationRecord): Promise<void> {
    this.invitation = input;
  }
  async acceptInvitation(): Promise<string> {
    return filmId;
  }
}

function setup() {
  const tenants = new FakeTenantRepository();
  const authorization: AuthorizationRepository = {
    loadFilmAccess: async () => ({
      filmId: filmId as never,
      userId: userId as never,
      membershipStatus: 'active',
      accountSuspended: false,
      sessionRevoked: false,
      grants: [
        {
          permission: 'film.members.manage',
          effect: 'allow',
          source: 'role',
        },
        {
          permission: 'film.archive',
          effect: 'allow',
          source: 'role',
        },
      ],
    }),
  };
  const auditEvents: Parameters<AuditRepository['insert']>[0][] = [];
  const auditRepository: AuditRepository = {
    insert: async (event) => {
      auditEvents.push(event);
    },
  };
  const service = new TenantService(
    tenants,
    new PermissionService(authorization),
    new AuditService(auditRepository),
  );
  return { service, tenants, auditEvents };
}

describe('TenantService invitations', () => {
  it('returns a one-time token while persisting only its hash', async () => {
    const { service, tenants, auditEvents } = setup();
    const result = await service.inviteMember(
      context,
      filmId,
      {
        email: 'invited@example.test',
        roleIds: [roleId],
        expiresAt: new Date('2026-11-14T00:00:00.000Z'),
      },
      now,
    );

    expect(result.token).toHaveLength(43);
    expect(Buffer.from(tenants.invitation?.tokenHash ?? [])).toEqual(
      createHash('sha256').update(result.token).digest(),
    );
    expect(JSON.stringify(tenants.invitation)).not.toContain(result.token);
    expect(auditEvents).toHaveLength(1);
    expect(JSON.stringify(auditEvents[0])).not.toContain(
      'invited@example.test',
    );
    expect(JSON.stringify(auditEvents[0])).not.toContain(result.token);
  });

  it('rejects an invitation that is not future-dated', async () => {
    const { service, tenants } = setup();
    await expect(
      service.inviteMember(
        context,
        filmId,
        {
          email: 'invited@example.test',
          roleIds: [],
          expiresAt: now,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(InvalidInvitationExpiryError);
    expect(tenants.invitation).toBeUndefined();
  });

  it('archives and restores a film with audit logging', async () => {
    const { service, tenants, auditEvents } = setup();
    await service.archiveFilm(context, filmId);
    expect(tenants.archived).toBe(true);
    expect(auditEvents.some((e) => e.action === 'film.archive')).toBe(true);

    await service.restoreFilm(context, filmId);
    expect(tenants.archived).toBe(false);
    expect(auditEvents.some((e) => e.action === 'film.restore')).toBe(true);
  });
});
