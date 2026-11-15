-- Migration 0012_production_breakdown.sql
-- Sprint 28: Production Breakdown (Gate G7)

-- 1. Production Elements: Locations, cast, props, costumes, vehicles, stunts, SFX, VFX, etc.
CREATE TABLE IF NOT EXISTS production_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'cast', 'location', 'props', 'costumes', 'makeup_hair',
    'vehicles', 'stunts', 'special_effects', 'visual_effects',
    'sound_music', 'animals', 'special_equipment', 'art_department'
  )),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  element_code text CHECK (element_code IS NULL OR length(trim(element_code)) BETWEEN 1 AND 50),
  description text,
  estimated_cost_cents integer NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  is_approved boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, category, name)
);

-- 2. Scene Breakdown Sheets: 1/8th page timings, dramatic/script day, revision tracking, locking
CREATE TABLE IF NOT EXISTS scene_breakdown_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES production_revisions(id) ON DELETE SET NULL,
  page_eighths integer NOT NULL DEFAULT 8 CHECK (page_eighths >= 1),
  estimated_shoot_minutes integer NOT NULL DEFAULT 60 CHECK (estimated_shoot_minutes >= 0),
  dramatic_day text CHECK (dramatic_day IS NULL OR length(trim(dramatic_day)) BETWEEN 1 AND 20),
  script_day text CHECK (script_day IS NULL OR length(trim(script_day)) BETWEEN 1 AND 50),
  synopsis text,
  setup_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'locked', 'ready_for_scheduling')),
  locked_by uuid REFERENCES users(id),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, scene_id)
);

-- 3. Scene Breakdown Items: Linking production elements to scene sheets with evidence & user-protection
CREATE TABLE IF NOT EXISTS scene_breakdown_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  breakdown_sheet_id uuid NOT NULL REFERENCES scene_breakdown_sheets(id) ON DELETE CASCADE,
  element_id uuid NOT NULL REFERENCES production_elements(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  is_required boolean NOT NULL DEFAULT true,
  notes text,
  source_origin text NOT NULL DEFAULT 'manual' CHECK (source_origin IN ('manual', 'ai_assisted', 'script_extracted')),
  evidence_text text,
  user_amended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (breakdown_sheet_id, element_id)
);

-- 4. Enable Row-Level Security
ALTER TABLE production_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_breakdown_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_breakdown_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY production_elements_member_read ON production_elements FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY production_elements_member_write ON production_elements FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY scene_breakdown_sheets_member_read ON scene_breakdown_sheets FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY scene_breakdown_sheets_member_write ON scene_breakdown_sheets FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY scene_breakdown_items_member_read ON scene_breakdown_items FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY scene_breakdown_items_member_write ON scene_breakdown_items FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS prod_elements_film_cat_idx ON production_elements (film_id, category);
CREATE INDEX IF NOT EXISTS scene_breakdown_film_scene_idx ON scene_breakdown_sheets (film_id, scene_id);
CREATE INDEX IF NOT EXISTS scene_breakdown_items_sheet_idx ON scene_breakdown_items (breakdown_sheet_id);
CREATE INDEX IF NOT EXISTS scene_breakdown_items_elem_idx ON scene_breakdown_items (element_id);
