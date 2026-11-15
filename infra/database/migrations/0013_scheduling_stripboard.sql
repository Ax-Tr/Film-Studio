-- Migration 0013_scheduling_stripboard.sql
-- Sprint 29: Scheduling and Stripboard (Gate G7)

-- 1. Shooting Schedules (Master and block schedules, versioned with approval lifecycle)
CREATE TABLE IF NOT EXISTS shooting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'archived')),
  start_date date NOT NULL,
  end_date date,
  estimated_shoot_days integer NOT NULL DEFAULT 1 CHECK (estimated_shoot_days >= 1),
  notes text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, version_number)
);

-- 2. Schedule Shoot Days (Daily call sheets / shoot days with hours and locations)
CREATE TABLE IF NOT EXISTS schedule_shoot_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES shooting_schedules(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number >= 1),
  calendar_date date NOT NULL,
  title text CHECK (title IS NULL OR length(trim(title)) BETWEEN 1 AND 255),
  call_time time,
  wrap_time time,
  primary_location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, day_number)
);

-- 3. Stripboard Strips (Scene strips, day banners, meal breaks, moves along the board)
CREATE TABLE IF NOT EXISTS schedule_strips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES shooting_schedules(id) ON DELETE CASCADE,
  strip_type text NOT NULL CHECK (strip_type IN ('scene', 'day_banner', 'company_move', 'meal_break', 'turnaround')),
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  shoot_day_id uuid REFERENCES schedule_shoot_days(id) ON DELETE SET NULL,
  strip_order integer NOT NULL CHECK (strip_order >= 0),
  page_eighths integer CHECK (page_eighths IS NULL OR page_eighths >= 1),
  estimated_minutes integer NOT NULL DEFAULT 60 CHECK (estimated_minutes >= 0),
  int_ext text CHECK (int_ext IS NULL OR int_ext IN ('INT', 'EXT', 'INT/EXT')),
  day_night text CHECK (day_night IS NULL OR day_night IN ('DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS')),
  location_text text,
  description text,
  cast_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_strips_order_uniq UNIQUE (schedule_id, strip_order) DEFERRABLE INITIALLY DEFERRED
);

-- 4. Schedule Constraints (Actor blackouts, permits, daylight windows, equipment limits)
CREATE TABLE IF NOT EXISTS schedule_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  constraint_type text NOT NULL CHECK (constraint_type IN (
    'actor_blackout', 'location_permit', 'daylight_window', 'equipment_availability', 'weather_window'
  )),
  entity_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  start_date date NOT NULL,
  end_date date NOT NULL,
  severity text NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard', 'soft')),
  explanation text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- 5. Schedule Conflicts (Explanations of violations, optimization proposals, manual overrides)
CREATE TABLE IF NOT EXISTS schedule_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES shooting_schedules(id) ON DELETE CASCADE,
  strip_id uuid REFERENCES schedule_strips(id) ON DELETE CASCADE,
  constraint_id uuid REFERENCES schedule_constraints(id) ON DELETE CASCADE,
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'actor_unavailable', 'permit_expired', 'overbooked_day', 'turnaround_violation', 'lighting_mismatch'
  )),
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'advisory')),
  proposed_resolution text,
  is_overridden boolean NOT NULL DEFAULT false,
  override_reason text,
  overridden_by uuid REFERENCES users(id),
  overridden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Enable Row-Level Security
ALTER TABLE shooting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_shoot_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_strips ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_conflicts ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
CREATE POLICY shooting_schedules_member_read ON shooting_schedules FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY shooting_schedules_member_write ON shooting_schedules FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY schedule_shoot_days_member_read ON schedule_shoot_days FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY schedule_shoot_days_member_write ON schedule_shoot_days FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY schedule_strips_member_read ON schedule_strips FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY schedule_strips_member_write ON schedule_strips FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY schedule_constraints_member_read ON schedule_constraints FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY schedule_constraints_member_write ON schedule_constraints FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY schedule_conflicts_member_read ON schedule_conflicts FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY schedule_conflicts_member_write ON schedule_conflicts FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS schedules_film_ver_idx ON shooting_schedules (film_id, version_number);
CREATE INDEX IF NOT EXISTS schedule_days_sched_idx ON schedule_shoot_days (schedule_id, day_number);
CREATE INDEX IF NOT EXISTS schedule_strips_sched_order_idx ON schedule_strips (schedule_id, strip_order);
CREATE INDEX IF NOT EXISTS schedule_constraints_film_idx ON schedule_constraints (film_id, constraint_type);
CREATE INDEX IF NOT EXISTS schedule_conflicts_sched_idx ON schedule_conflicts (schedule_id, is_overridden);
