-- Migration: 001_initial_schema.sql
-- Scheduler M8: Initial database schema for Supabase/PostgreSQL
--
-- Run this migration in Supabase SQL Editor or via Supabase CLI:
-- supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Scheduling Requests
-- ============================================

CREATE TABLE scheduling_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context (from iCIMS or manual entry)
  application_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  req_id TEXT,
  req_title TEXT NOT NULL,
  interview_type TEXT NOT NULL CHECK (interview_type IN ('phone_screen', 'hm_screen', 'onsite', 'final')),
  duration_minutes INTEGER NOT NULL,

  -- Participants
  interviewer_emails TEXT[] NOT NULL,

  -- Calendar linkage
  organizer_email TEXT NOT NULL,
  calendar_provider TEXT NOT NULL DEFAULT 'microsoft_graph',
  graph_tenant_id TEXT,

  -- Scheduling window
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  candidate_timezone TEXT NOT NULL,

  -- Public link
  public_token TEXT NOT NULL,
  public_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'rescheduled', 'cancelled', 'expired')),

  -- Attention flags (M6)
  needs_attention BOOLEAN NOT NULL DEFAULT false,
  needs_attention_reason TEXT,

  -- Audit
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for scheduling_requests
CREATE INDEX idx_scheduling_requests_status ON scheduling_requests(status);
CREATE INDEX idx_scheduling_requests_public_token_hash ON scheduling_requests(public_token_hash);
CREATE INDEX idx_scheduling_requests_candidate_email ON scheduling_requests(candidate_email);
CREATE INDEX idx_scheduling_requests_needs_attention ON scheduling_requests(needs_attention) WHERE needs_attention = true;
CREATE INDEX idx_scheduling_requests_expires_at ON scheduling_requests(expires_at);
CREATE INDEX idx_scheduling_requests_created_at ON scheduling_requests(created_at DESC);

-- ============================================
-- Bookings
-- ============================================

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES scheduling_requests(id) ON DELETE CASCADE,

  -- Scheduled time
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Calendar event
  calendar_event_id TEXT,
  calendar_ical_uid TEXT,
  conference_join_url TEXT,

  -- iCIMS sync (M6)
  icims_activity_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'rescheduled', 'cancelled')),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,

  -- Audit
  booked_by TEXT NOT NULL,
  booked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for bookings
CREATE INDEX idx_bookings_request_id ON bookings(request_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled_start ON bookings(scheduled_start);

-- ============================================
-- Audit Logs
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES scheduling_requests(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('coordinator', 'candidate', 'system')),
  actor_id TEXT,

  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit_logs
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_booking_id ON audit_logs(booking_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================
-- Sync Jobs (iCIMS retry queue)
-- ============================================

CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('icims_note')),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('scheduling_request', 'booking')),

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  last_error TEXT,

  payload JSONB NOT NULL DEFAULT '{}',
  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for sync_jobs
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_run_after ON sync_jobs(run_after) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sync_jobs_entity_id ON sync_jobs(entity_id);

-- ============================================
-- Webhook Events (M6)
-- ============================================

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  provider TEXT NOT NULL DEFAULT 'icims',
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,

  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,

  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Idempotency constraint
  UNIQUE(provider, event_id)
);

-- Indexes for webhook_events
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_payload_hash ON webhook_events(payload_hash);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_run_after ON webhook_events(run_after) WHERE status = 'received';

-- ============================================
-- Reconciliation Jobs (M6)
-- ============================================

CREATE TABLE reconciliation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('icims_note_missing', 'calendar_event_missing', 'state_mismatch')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('scheduling_request', 'booking')),
  entity_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'requires_attention')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  detection_reason TEXT NOT NULL,

  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for reconciliation_jobs
CREATE INDEX idx_reconciliation_jobs_status ON reconciliation_jobs(status);
CREATE INDEX idx_reconciliation_jobs_entity ON reconciliation_jobs(entity_type, entity_id);
CREATE INDEX idx_reconciliation_jobs_run_after ON reconciliation_jobs(run_after) WHERE status = 'pending';

-- ============================================
-- Interviewer Identities
-- ============================================

CREATE TABLE interviewer_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  email TEXT NOT NULL,
  calendar_provider_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, email)
);

-- Index for email lookup
CREATE INDEX idx_interviewer_identities_email ON interviewer_identities(LOWER(email));

-- ============================================
-- Tenant Configs
-- ============================================

CREATE TABLE tenant_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  graph_tenant_id TEXT NOT NULL,
  graph_client_id TEXT NOT NULL,
  graph_client_secret_ref TEXT NOT NULL,
  graph_organizer_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================
-- Updated_at Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_scheduling_requests_updated_at
  BEFORE UPDATE ON scheduling_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_jobs_updated_at
  BEFORE UPDATE ON sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_events_updated_at
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_jobs_updated_at
  BEFORE UPDATE ON reconciliation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_configs_updated_at
  BEFORE UPDATE ON tenant_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- Disabled by default for service role access
-- Enable when adding user authentication in M7.5
-- ============================================

-- For now, RLS is not enabled. The service role key bypasses RLS anyway.
-- When M7.5 adds user authentication, we'll add RLS policies:
-- ALTER TABLE scheduling_requests ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view their own requests" ON scheduling_requests
--   FOR SELECT USING (coordinator_id = auth.uid());
