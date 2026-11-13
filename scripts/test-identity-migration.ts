import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-aa7f-76a7-b2f1-38d5d2b6c577';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';
const roleOne = '018f4ce4-d16a-78b4-b2b1-85ec72e26323';
const invitationOne = '018f4ce4-d95a-72e3-884b-f190e7ce0d3d';

async function main(): Promise<void> {
  const migration = await readFile(
    new URL(
      '../infra/database/migrations/0001_identity_tenant.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const database = new PGlite();

  try {
    await database.exec(migration);
    await database.exec(`
    INSERT INTO users (id, display_name, primary_email) VALUES
      ('${userOne}', 'Synthetic User One', 'one@example.test'),
      ('${userTwo}', 'Synthetic User Two', 'two@example.test');

    SELECT set_config('app.user_id', '${userOne}', false);
    SELECT app_security.create_organization(
      '${organizationOne}', 'Synthetic Organization One'
    );
    SELECT app_security.create_film(
      '${filmOne}', '${organizationOne}', 'Synthetic Film One'
    );

    SELECT set_config('app.user_id', '${userTwo}', false);
    SELECT app_security.create_organization(
      '${organizationTwo}', 'Synthetic Organization Two'
    );
    SELECT app_security.create_film(
      '${filmTwo}', '${organizationTwo}', 'Synthetic Film Two'
    );

    INSERT INTO permissions (key, description)
      VALUES ('film.delete', 'Synthetic permission used by the migration test');
    INSERT INTO membership_permission_overrides (
      film_id, user_id, permission_key, effect, reason, granted_by
    ) VALUES (
      '${filmOne}', '${userOne}', 'film.delete', 'deny',
      'Synthetic explicit-deny precedence test', '${userOne}'
    );

    INSERT INTO auth_identities (
      id, user_id, issuer, subject, email_at_provider, email_verified
    ) VALUES (
      '018f4ce4-e1e8-7e76-b481-55c23f3d7d4f', '${userTwo}',
      'https://identity.example.test', 'synthetic-user-two',
      'two@example.test', true
    );
    INSERT INTO roles (id, film_id, name)
      VALUES ('${roleOne}', '${filmOne}', 'Synthetic Crew');
    INSERT INTO film_invitations (
      id, film_id, email, token_hash, status, invited_by, expires_at
    ) VALUES (
      '${invitationOne}', '${filmOne}', 'two@example.test',
      decode(repeat('ab', 32), 'hex'), 'pending', '${userOne}', now() + interval '1 day'
    );
    INSERT INTO film_invitation_roles (film_id, invitation_id, role_id)
      VALUES ('${filmOne}', '${invitationOne}', '${roleOne}');

    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public, app_security TO app_runtime;
    GRANT SELECT ON films, film_memberships, organizations,
      organization_memberships, membership_roles TO app_runtime;
    SET ROLE app_runtime;
  `);

    await database.exec(`
    SELECT set_config('app.user_id', '${userOne}', false);
    SELECT set_config('app.film_id', '${filmOne}', false);
  `);
    const ownFilm = await database.query<{ id: string }>(
      'SELECT id FROM films ORDER BY id',
    );
    if (ownFilm.rows.length !== 1 || ownFilm.rows[0]?.id !== filmOne) {
      throw new Error('RLS did not expose exactly the selected member film.');
    }
    const ownOrganization = await database.query<{ id: string }>(
      'SELECT id FROM organizations ORDER BY id',
    );
    if (
      ownOrganization.rows.length !== 1 ||
      ownOrganization.rows[0]?.id !== organizationOne
    ) {
      throw new Error('Organization RLS isolation failed.');
    }
    const denied = await database.query<{ allowed: boolean }>(
      `SELECT app_security.has_film_permission(
       '${filmOne}', 'film.delete'
     ) AS allowed`,
    );
    if (denied.rows[0]?.allowed !== false) {
      throw new Error('Explicit deny did not override film ownership.');
    }

    await database.exec(
      `SELECT set_config('app.film_id', '${filmTwo}', false);`,
    );
    const otherFilm = await database.query<{ id: string }>(
      'SELECT id FROM films',
    );
    if (otherFilm.rows.length !== 0) {
      throw new Error('Cross-film RLS isolation failed.');
    }

    let wrongIdentityRejected = false;
    try {
      await database.exec(`
      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT set_config('app.film_id', '', false);
      SELECT app_security.accept_film_invitation(decode(repeat('ab', 32), 'hex'));
    `);
    } catch {
      wrongIdentityRejected = true;
    }
    if (!wrongIdentityRejected) {
      throw new Error(
        'Invitation was accepted by a different verified identity.',
      );
    }

    await database.exec(`
    SELECT set_config('app.user_id', '${userTwo}', false);
    SELECT set_config('app.film_id', '', false);
    SELECT app_security.accept_film_invitation(decode(repeat('ab', 32), 'hex'));
    SELECT set_config('app.film_id', '${filmOne}', false);
  `);
    const acceptedFilm = await database.query<{ id: string }>(
      'SELECT id FROM films WHERE id = $1',
      [filmOne],
    );
    if (acceptedFilm.rows[0]?.id !== filmOne) {
      throw new Error('Accepted invitation did not activate film access.');
    }
    const assignedRole = await database.query<{ role_id: string }>(
      'SELECT role_id FROM membership_roles WHERE film_id = $1 AND user_id = $2',
      [filmOne, userTwo],
    );
    if (assignedRole.rows[0]?.role_id !== roleOne) {
      throw new Error('Accepted invitation did not assign the invited role.');
    }

    process.stdout.write(
      'Identity migration applied; ownership, invitation acceptance and tenant isolation verified.\n',
    );
  } finally {
    await database.close();
  }
}

void main();
