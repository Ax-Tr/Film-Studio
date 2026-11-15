-- Migration 0014_budget_and_production_reporting.sql
-- Sprint 30: Budget and Production Reporting (Gate G7 Exit)

-- 1. Production Budgets: Master/block budgets, currency, versioning, contingency, and tax policy
CREATE TABLE IF NOT EXISTS production_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES shooting_schedules(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  currency text NOT NULL DEFAULT 'INR' CHECK (length(trim(currency)) BETWEEN 3 AND 10),
  contingency_percentage real NOT NULL DEFAULT 10.0 CHECK (contingency_percentage >= 0 AND contingency_percentage <= 50),
  tax_percentage real NOT NULL DEFAULT 18.0 CHECK (tax_percentage >= 0 AND tax_percentage <= 50),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'locked', 'approved', 'archived')),
  notes text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, version_number)
);

-- 2. Production Rate Cards: Configurable crew, equipment, and facility rate cards
CREATE TABLE IF NOT EXISTS production_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  category text NOT NULL CHECK (category IN (
    'above_the_line', 'below_the_line_production', 'below_the_line_post', 'other_production'
  )),
  rate_unit text NOT NULL CHECK (rate_unit IN (
    'hourly', 'daily', 'weekly', 'flat', 'per_item', 'per_scene'
  )),
  standard_rate_cents bigint NOT NULL CHECK (standard_rate_cents >= 0),
  overtime_rate_cents bigint CHECK (overtime_rate_cents IS NULL OR overtime_rate_cents >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (length(trim(currency)) BETWEEN 3 AND 10),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, name)
);

-- 3. Budget Line Items: Chart of accounts, quantities, ranges, assumptions, schedule linkage
CREATE TABLE IF NOT EXISTS budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES production_budgets(id) ON DELETE CASCADE,
  rate_card_id uuid REFERENCES production_rate_cards(id) ON DELETE SET NULL,
  element_id uuid REFERENCES production_elements(id) ON DELETE SET NULL,
  account_code text NOT NULL CHECK (length(trim(account_code)) BETWEEN 1 AND 20),
  category text NOT NULL CHECK (category IN (
    'above_the_line', 'below_the_line_production', 'below_the_line_post', 'other_production'
  )),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 255),
  quantity numeric(10, 2) NOT NULL DEFAULT 1.0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'days' CHECK (length(trim(unit)) BETWEEN 1 AND 50),
  unit_rate_cents bigint NOT NULL CHECK (unit_rate_cents >= 0),
  fringe_percentage real NOT NULL DEFAULT 0.0 CHECK (fringe_percentage >= 0 AND fringe_percentage <= 100),
  low_estimate_cents bigint NOT NULL CHECK (low_estimate_cents >= 0),
  estimated_total_cents bigint NOT NULL CHECK (estimated_total_cents >= 0),
  high_estimate_cents bigint NOT NULL CHECK (high_estimate_cents >= 0),
  actual_cost_cents bigint NOT NULL DEFAULT 0 CHECK (actual_cost_cents >= 0),
  assumptions text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Production Cost Reports: Top sheet and detailed exports with formulaic calculations
CREATE TABLE IF NOT EXISTS production_cost_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES production_budgets(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN (
    'budget_variance', 'cost_to_complete', 'top_sheet', 'detailed_ledger'
  )),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 255),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  contingency_cents bigint NOT NULL CHECK (contingency_cents >= 0),
  tax_cents bigint NOT NULL CHECK (tax_cents >= 0),
  grand_total_cents bigint NOT NULL CHECK (grand_total_cents >= 0),
  report_payload jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Enable Row-Level Security
ALTER TABLE production_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_cost_reports ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY production_budgets_member_read ON production_budgets FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY production_budgets_member_write ON production_budgets FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY production_rate_cards_member_read ON production_rate_cards FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY production_rate_cards_member_write ON production_rate_cards FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY budget_line_items_member_read ON budget_line_items FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY budget_line_items_member_write ON budget_line_items FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

CREATE POLICY production_cost_reports_member_read ON production_cost_reports FOR SELECT USING (
  app_security.has_active_film_membership(film_id)
);
CREATE POLICY production_cost_reports_member_write ON production_cost_reports FOR ALL USING (
  app_security.has_film_permission(film_id, 'film.documents.edit')
) WITH CHECK (
  app_security.has_film_permission(film_id, 'film.documents.edit')
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS prod_budgets_film_ver_idx ON production_budgets (film_id, version_number);
CREATE INDEX IF NOT EXISTS prod_rate_cards_film_cat_idx ON production_rate_cards (film_id, category);
CREATE INDEX IF NOT EXISTS budget_line_items_budget_idx ON budget_line_items (budget_id, sort_order);
CREATE INDEX IF NOT EXISTS budget_line_items_account_idx ON budget_line_items (film_id, account_code);
CREATE INDEX IF NOT EXISTS prod_cost_reports_budget_idx ON production_cost_reports (budget_id, report_type);
