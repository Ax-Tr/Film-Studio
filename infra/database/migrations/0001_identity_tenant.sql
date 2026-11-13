CREATE SCHEMA IF NOT EXISTS app_security;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  primary_email text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deletion_requested', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_primary_email_unique
  ON users (lower(primary_email))
  WHERE primary_email IS NOT NULL AND status <> 'deleted';

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer text NOT NULL CHECK (issuer ~ '^https://'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  email_at_provider text,
  email_verified boolean NOT NULL DEFAULT false,
  last_authenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX auth_identities_user_id_idx ON auth_identities (user_id);

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  label text CHECK (label IS NULL OR length(label) <= 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  access_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(access_token_hash) = 32),
  refresh_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(refresh_token_hash) = 32),
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  authenticated_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'user_logout', 'user_revoke', 'admin_security', 'replay_detected',
      'device_revoked', 'account_suspended'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_device_owner_fk
    FOREIGN KEY (user_id, device_id) REFERENCES devices(user_id, id) ON DELETE CASCADE,
  CHECK (access_expires_at < refresh_expires_at)
);

CREATE INDEX sessions_user_active_idx
  ON sessions (user_id, refresh_expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX sessions_family_idx ON sessions (family_id);

CREATE TABLE used_refresh_tokens (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX used_refresh_tokens_family_idx ON used_refresh_tokens (family_id);

CREATE TABLE auth_transactions (
  id uuid PRIMARY KEY,
  state_hash bytea NOT NULL UNIQUE CHECK (octet_length(state_hash) = 32),
  browser_binding_hash bytea NOT NULL CHECK (octet_length(browser_binding_hash) = 32),
  nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
  code_verifier_ciphertext bytea NOT NULL,
  redirect_uri text NOT NULL CHECK (redirect_uri ~ '^https://|^http://127\\.0\\.0\\.1'),
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE films (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deletion_requested', 'deleted')),
  permission_revision bigint NOT NULL DEFAULT 1 CHECK (permission_revision > 0),
  server_revision bigint NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE film_memberships (
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  invited_by uuid REFERENCES users(id),
  joined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, user_id)
);

ALTER TABLE films ADD CONSTRAINT films_owner_membership_fk
  FOREIGN KEY (id, owner_user_id)
  REFERENCES film_memberships(film_id, user_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE permissions (
  key text PRIMARY KEY CHECK (key = '*' OR key ~ '^[a-z][a-z0-9_.-]+$'),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id),
  UNIQUE (film_id, name)
);

CREATE TABLE role_permissions (
  film_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permissions(key),
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  PRIMARY KEY (role_id, permission_key),
  FOREIGN KEY (film_id, role_id) REFERENCES roles(film_id, id) ON DELETE CASCADE
);

CREATE TABLE membership_roles (
  film_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (film_id, user_id, role_id),
  FOREIGN KEY (film_id, user_id) REFERENCES film_memberships(film_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, role_id) REFERENCES roles(film_id, id) ON DELETE CASCADE
);

CREATE TABLE membership_permission_overrides (
  film_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permissions(key),
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, user_id, permission_key),
  FOREIGN KEY (film_id, user_id) REFERENCES film_memberships(film_id, user_id) ON DELETE CASCADE
);

CREATE TABLE film_invitations (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 320),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, id)
);

CREATE UNIQUE INDEX film_invitations_pending_email_unique
  ON film_invitations (film_id, lower(email))
  WHERE status = 'pending';

CREATE TABLE film_invitation_roles (
  film_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (invitation_id, role_id),
  FOREIGN KEY (film_id, invitation_id)
    REFERENCES film_invitations(film_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id, role_id)
    REFERENCES roles(film_id, id) ON DELETE CASCADE
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  actor_session_id uuid REFERENCES sessions(id),
  film_id uuid REFERENCES films(id),
  organization_id uuid REFERENCES organizations(id),
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]+$'),
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  target_type text,
  target_id uuid,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 128),
  source_ip_hash bytea CHECK (source_ip_hash IS NULL OR octet_length(source_ip_hash) = 32),
  user_agent_hash bytea CHECK (user_agent_hash IS NULL OR octet_length(user_agent_hash) = 32),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_events_film_time_idx ON audit_events (film_id, occurred_at DESC);
CREATE INDEX audit_events_actor_time_idx ON audit_events (actor_user_id, occurred_at DESC);

CREATE FUNCTION app_security.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE FUNCTION app_security.current_film_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.film_id', true), '')::uuid
$$;

CREATE FUNCTION app_security.has_active_organization_membership(
  target_organization_id uuid,
  required_roles text[] DEFAULT ARRAY['owner', 'admin', 'member']::text[]
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = app_security.current_user_id()
      AND membership.status = 'active'
      AND membership.role = ANY(required_roles)
  )
$$;

CREATE FUNCTION app_security.has_active_film_membership(target_film_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_film_id = app_security.current_film_id()
    AND EXISTS (
      SELECT 1 FROM film_memberships membership
      WHERE membership.film_id = target_film_id
        AND membership.user_id = app_security.current_user_id()
        AND membership.status = 'active'
    )
$$;

CREATE FUNCTION app_security.has_film_permission(target_film_id uuid, required_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app_security.has_active_film_membership(target_film_id)
    AND NOT EXISTS (
      SELECT 1 FROM membership_permission_overrides override_permission
      WHERE override_permission.film_id = target_film_id
        AND override_permission.user_id = app_security.current_user_id()
        AND override_permission.permission_key IN (required_permission, '*')
        AND override_permission.effect = 'deny'
    )
    AND (
      EXISTS (
        SELECT 1 FROM films film
        WHERE film.id = target_film_id
          AND film.owner_user_id = app_security.current_user_id()
      )
      OR EXISTS (
        SELECT 1 FROM membership_permission_overrides override_permission
        WHERE override_permission.film_id = target_film_id
          AND override_permission.user_id = app_security.current_user_id()
          AND override_permission.permission_key IN (required_permission, '*')
          AND override_permission.effect = 'allow'
      )
      OR EXISTS (
        SELECT 1
        FROM membership_roles membership_role
        JOIN role_permissions role_permission
          ON role_permission.film_id = membership_role.film_id
         AND role_permission.role_id = membership_role.role_id
        WHERE membership_role.film_id = target_film_id
          AND membership_role.user_id = app_security.current_user_id()
          AND role_permission.permission_key IN (required_permission, '*')
          AND role_permission.effect = 'allow'
      )
    )
$$;

CREATE FUNCTION app_security.create_organization(
  new_organization_id uuid,
  organization_name text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_user_id uuid := app_security.current_user_id();
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user context is required';
  END IF;
  INSERT INTO organizations (id, name) VALUES (new_organization_id, organization_name);
  INSERT INTO organization_memberships (organization_id, user_id, role, status)
    VALUES (new_organization_id, actor_user_id, 'owner', 'active');
  RETURN new_organization_id;
END
$$;

CREATE FUNCTION app_security.create_film(
  new_film_id uuid,
  target_organization_id uuid,
  film_title text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_user_id uuid := app_security.current_user_id();
BEGIN
  IF NOT app_security.has_active_organization_membership(
    target_organization_id,
    ARRAY['owner', 'admin']::text[]
  ) THEN
    RAISE EXCEPTION 'organization administration permission is required';
  END IF;
  INSERT INTO films (id, organization_id, owner_user_id, title)
    VALUES (new_film_id, target_organization_id, actor_user_id, film_title);
  INSERT INTO film_memberships (film_id, user_id, status, joined_at)
    VALUES (new_film_id, actor_user_id, 'active', now());
  RETURN new_film_id;
END
$$;

CREATE FUNCTION app_security.list_accessible_films()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  title text,
  status text,
  permission_revision bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT film.id, film.organization_id, film.title, film.status,
    film.permission_revision
  FROM films film
  JOIN film_memberships membership ON membership.film_id = film.id
  WHERE membership.user_id = app_security.current_user_id()
    AND membership.status = 'active'
    AND film.status <> 'deleted'
  ORDER BY film.updated_at DESC, film.id
$$;

CREATE FUNCTION app_security.accept_film_invitation(
  presented_token_hash bytea
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_user_id uuid := app_security.current_user_id();
  invitation_record film_invitations%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user context is required';
  END IF;
  SELECT * INTO invitation_record
  FROM film_invitations invitation
  WHERE invitation.token_hash = presented_token_hash
    AND invitation.status = 'pending'
    AND invitation.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation is invalid or expired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth_identities identity
    WHERE identity.user_id = actor_user_id
      AND identity.email_verified = true
      AND lower(identity.email_at_provider) = lower(invitation_record.email)
  ) THEN
    RAISE EXCEPTION 'verified identity email does not match invitation';
  END IF;

  INSERT INTO film_memberships (film_id, user_id, status, invited_by, joined_at)
    VALUES (
      invitation_record.film_id,
      actor_user_id,
      'active',
      invitation_record.invited_by,
      now()
    )
    ON CONFLICT (film_id, user_id) DO UPDATE SET
      status = 'active',
      invited_by = EXCLUDED.invited_by,
      joined_at = now(),
      revoked_at = NULL,
      updated_at = now();

  INSERT INTO membership_roles (film_id, user_id, role_id)
    SELECT role_assignment.film_id, actor_user_id, role_assignment.role_id
    FROM film_invitation_roles role_assignment
    WHERE role_assignment.invitation_id = invitation_record.id
    ON CONFLICT DO NOTHING;

  UPDATE film_invitations SET
    status = 'accepted',
    accepted_by = actor_user_id,
    accepted_at = now()
  WHERE id = invitation_record.id;
  RETURN invitation_record.film_id;
END
$$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE films ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_invitation_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self ON users USING (id = app_security.current_user_id());
CREATE POLICY auth_identities_self ON auth_identities USING (user_id = app_security.current_user_id());
CREATE POLICY devices_self ON devices USING (user_id = app_security.current_user_id());
CREATE POLICY sessions_self ON sessions USING (user_id = app_security.current_user_id());

CREATE POLICY organizations_member_read ON organizations FOR SELECT USING (
  app_security.has_active_organization_membership(id)
);
CREATE POLICY organizations_admin_write ON organizations FOR UPDATE USING (
  app_security.has_active_organization_membership(
    id,
    ARRAY['owner', 'admin']::text[]
  )
);

CREATE POLICY organization_memberships_member_read ON organization_memberships FOR SELECT USING (
  user_id = app_security.current_user_id()
  OR app_security.has_active_organization_membership(
    organization_id,
    ARRAY['owner', 'admin']::text[]
  )
);
CREATE POLICY organization_memberships_admin_write ON organization_memberships FOR ALL USING (
  app_security.has_active_organization_membership(
    organization_id,
    ARRAY['owner', 'admin']::text[]
  )
) WITH CHECK (
  app_security.has_active_organization_membership(
    organization_id,
    ARRAY['owner', 'admin']::text[]
  )
);

CREATE POLICY films_member_read ON films FOR SELECT USING (
  app_security.has_active_film_membership(id)
);
CREATE POLICY films_owner_write ON films FOR UPDATE USING (
  app_security.has_active_film_membership(id)
  AND owner_user_id = app_security.current_user_id()
);

CREATE POLICY film_memberships_member_read ON film_memberships FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY film_memberships_admin_write ON film_memberships FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.members.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.members.manage')
);

CREATE POLICY roles_member_read ON roles FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY roles_admin_write ON roles FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.roles.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.roles.manage')
);

CREATE POLICY role_permissions_member_read ON role_permissions FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY role_permissions_admin_write ON role_permissions FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.roles.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.roles.manage')
);

CREATE POLICY membership_roles_member_read ON membership_roles FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY membership_roles_admin_write ON membership_roles FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.members.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.members.manage')
);

CREATE POLICY membership_overrides_member_read ON membership_permission_overrides FOR SELECT USING (
  user_id = app_security.current_user_id()
  OR app_security.has_film_permission(film_id, 'film.roles.manage')
);
CREATE POLICY membership_overrides_admin_write ON membership_permission_overrides FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.roles.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.roles.manage')
);

CREATE POLICY film_invitations_admin_access ON film_invitations FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.members.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.members.manage')
);

CREATE POLICY film_invitation_roles_admin_access ON film_invitation_roles FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.members.manage')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.members.manage')
);

CREATE POLICY audit_film_read ON audit_events FOR SELECT USING (
  (film_id IS NULL AND actor_user_id = app_security.current_user_id())
  OR (film_id IS NOT NULL AND app_security.has_film_permission(film_id, 'film.audit.read'))
);
CREATE POLICY audit_actor_insert ON audit_events FOR INSERT WITH CHECK (
  actor_user_id = app_security.current_user_id()
  AND (film_id IS NULL OR film_id = app_security.current_film_id())
);

