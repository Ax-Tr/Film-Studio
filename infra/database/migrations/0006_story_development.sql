-- Migration 0006_story_development.sql
-- Sprint 22: Story Development Studio (Bible, Concepts, Beats, Threads, Timelines)

-- 1. Story Concept & Bible (logline, dramatic question, theme, premise, synopsis, treatments)
CREATE TABLE IF NOT EXISTS story_bibles (
  film_id uuid PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
  premise text,
  theme text,
  dramatic_question text,
  narrative_structure text NOT NULL DEFAULT 'three_act'
    CHECK (narrative_structure IN ('three_act', 'hero_journey', 'save_the_cat', 'dan_harmon_circle', 'seven_point', 'freytag_pyramid', 'custom')),
  logline text,
  short_synopsis text,
  long_synopsis text,
  treatment text,
  world_building_rules jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(world_building_rules) = 'object'),
  historical_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Story Narrative Threads (Plotlines: A-Story, B-Story, C-Story, character subplots)
CREATE TABLE IF NOT EXISTS story_threads (
  id uuid DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  color_hex text NOT NULL DEFAULT '#f3b74f' CHECK (color_hex ~* '^#[0-9a-f]{6}$'),
  thread_type text NOT NULL DEFAULT 'plot'
    CHECK (thread_type IN ('plot', 'theme', 'character_arc', 'relationship', 'mystery')),
  description text,
  sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, id)
);

-- 3. Story Beats (Structure Beats e.g. Catalyst, Break into Two, Midpoint, All is Lost, Climax)
CREATE TABLE IF NOT EXISTS story_beats (
  id uuid DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  thread_id uuid,
  act integer NOT NULL DEFAULT 1 CHECK (act BETWEEN 1 AND 5),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  beat_type text NOT NULL DEFAULT 'beat',
  timing_minute integer CHECK (timing_minute >= 0),
  description text,
  sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
  linked_scene_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, id),
  FOREIGN KEY (film_id, thread_id)
    REFERENCES story_threads(film_id, id) ON DELETE SET NULL
);

-- 4. Enable Row Level Security
ALTER TABLE story_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_beats ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Story Bibles
CREATE POLICY story_bibles_member_read ON story_bibles FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY story_bibles_member_write ON story_bibles FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 6. RLS Policies for Story Threads
CREATE POLICY story_threads_member_read ON story_threads FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY story_threads_member_write ON story_threads FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 7. RLS Policies for Story Beats
CREATE POLICY story_beats_member_read ON story_beats FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);

CREATE POLICY story_beats_member_write ON story_beats FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);
