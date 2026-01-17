-- Loop Autopilot V1 Migration
-- Adds tables for loop templates, solve runs, and bookings

-- ============================================================================
-- Loop Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS loop_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,

  CONSTRAINT unique_template_name_per_org UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_loop_templates_org ON loop_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_loop_templates_active ON loop_templates(organization_id, is_active);

-- ============================================================================
-- Loop Session Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS loop_session_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  interviewer_pool JSONB NOT NULL, -- { emails: string[], requiredCount: number }
  constraints JSONB NOT NULL DEFAULT '{}', -- SessionConstraints
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_session_order UNIQUE (loop_template_id, "order"),
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

CREATE INDEX IF NOT EXISTS idx_loop_session_templates_template ON loop_session_templates(loop_template_id);

-- ============================================================================
-- Loop Solve Runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS loop_solve_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  availability_request_id UUID NOT NULL,
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id),

  -- Input snapshot (for audit and debugging)
  inputs_snapshot JSONB NOT NULL,

  -- Result
  status VARCHAR(50) NOT NULL, -- SOLVED, UNSATISFIABLE, PARTIAL, TIMEOUT, ERROR
  result_snapshot JSONB, -- LoopSolveResult
  solutions_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  solve_duration_ms INTEGER,
  search_iterations INTEGER,
  graph_api_calls INTEGER,

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solve_idempotency_key VARCHAR(255),

  CONSTRAINT unique_solve_idempotency UNIQUE (solve_idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_loop_solve_runs_availability ON loop_solve_runs(availability_request_id);
CREATE INDEX IF NOT EXISTS idx_loop_solve_runs_org_created ON loop_solve_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loop_solve_runs_status ON loop_solve_runs(status);

-- ============================================================================
-- Loop Bookings
-- ============================================================================

CREATE TABLE IF NOT EXISTS loop_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  availability_request_id UUID NOT NULL,
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id),
  solve_run_id UUID NOT NULL REFERENCES loop_solve_runs(id),
  chosen_solution_id VARCHAR(255) NOT NULL,

  status VARCHAR(50) NOT NULL, -- PENDING, COMMITTED, FAILED, CANCELLED

  -- Rollback tracking
  rollback_attempted BOOLEAN DEFAULT false,
  rollback_details JSONB,

  -- Error tracking
  error_message TEXT,

  commit_idempotency_key VARCHAR(255) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_commit_idempotency UNIQUE (commit_idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_loop_bookings_availability ON loop_bookings(availability_request_id);
CREATE INDEX IF NOT EXISTS idx_loop_bookings_status ON loop_bookings(status);
CREATE INDEX IF NOT EXISTS idx_loop_bookings_org_created ON loop_bookings(organization_id, created_at DESC);

-- ============================================================================
-- Loop Booking Items (links sessions to bookings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loop_booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_booking_id UUID NOT NULL REFERENCES loop_bookings(id) ON DELETE CASCADE,
  session_template_id UUID NOT NULL,
  booking_id UUID NOT NULL,
  calendar_event_id VARCHAR(255) NOT NULL,

  -- Session-specific status
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- confirmed, cancelled, rescheduled

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_session_per_loop UNIQUE (loop_booking_id, session_template_id)
);

CREATE INDEX IF NOT EXISTS idx_loop_booking_items_booking ON loop_booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_loop_booking_items_loop ON loop_booking_items(loop_booking_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE loop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_solve_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_booking_items ENABLE ROW LEVEL SECURITY;

-- Loop templates: org members can read, service role can write
CREATE POLICY loop_templates_select ON loop_templates FOR SELECT USING (true);
CREATE POLICY loop_templates_insert ON loop_templates FOR INSERT WITH CHECK (true);
CREATE POLICY loop_templates_update ON loop_templates FOR UPDATE USING (true);
CREATE POLICY loop_templates_delete ON loop_templates FOR DELETE USING (true);

-- Loop session templates: follow parent template access
CREATE POLICY loop_session_templates_select ON loop_session_templates FOR SELECT USING (true);
CREATE POLICY loop_session_templates_insert ON loop_session_templates FOR INSERT WITH CHECK (true);
CREATE POLICY loop_session_templates_update ON loop_session_templates FOR UPDATE USING (true);
CREATE POLICY loop_session_templates_delete ON loop_session_templates FOR DELETE USING (true);

-- Loop solve runs: org members can read, service role can write
CREATE POLICY loop_solve_runs_select ON loop_solve_runs FOR SELECT USING (true);
CREATE POLICY loop_solve_runs_insert ON loop_solve_runs FOR INSERT WITH CHECK (true);
CREATE POLICY loop_solve_runs_update ON loop_solve_runs FOR UPDATE USING (true);

-- Loop bookings: org members can read, service role can write
CREATE POLICY loop_bookings_select ON loop_bookings FOR SELECT USING (true);
CREATE POLICY loop_bookings_insert ON loop_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY loop_bookings_update ON loop_bookings FOR UPDATE USING (true);

-- Loop booking items: follow parent booking access
CREATE POLICY loop_booking_items_select ON loop_booking_items FOR SELECT USING (true);
CREATE POLICY loop_booking_items_insert ON loop_booking_items FOR INSERT WITH CHECK (true);
CREATE POLICY loop_booking_items_update ON loop_booking_items FOR UPDATE USING (true);
