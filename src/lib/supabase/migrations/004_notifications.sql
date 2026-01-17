-- Migration: 004_notifications.sql
-- M10: Notifications and Reminders system
--
-- Run this migration in Supabase SQL Editor after 003_organizations.sql

-- ============================================
-- Notification Jobs Table
-- ============================================

CREATE TYPE notification_status AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

CREATE TYPE notification_type AS ENUM (
  'candidate_availability_request',
  'candidate_self_schedule_link',
  'booking_confirmation',
  'reschedule_confirmation',
  'cancel_notice',
  'reminder_24h',
  'reminder_2h'
);

CREATE TABLE notification_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tenant and context
  tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Notification type and entity reference
  type notification_type NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('scheduling_request', 'booking', 'availability_request')),
  entity_id UUID NOT NULL,

  -- Idempotency - unique constraint ensures no duplicate sends
  idempotency_key TEXT NOT NULL UNIQUE,

  -- Recipient
  to_email TEXT NOT NULL,

  -- Template variables and content
  payload_json JSONB NOT NULL DEFAULT '{}',

  -- Status tracking
  status notification_status NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,

  -- Scheduling
  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Error tracking
  last_error TEXT,

  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for notification_jobs
CREATE INDEX idx_notification_jobs_status ON notification_jobs(status);
CREATE INDEX idx_notification_jobs_run_after ON notification_jobs(run_after) WHERE status = 'PENDING';
CREATE INDEX idx_notification_jobs_entity ON notification_jobs(entity_type, entity_id);
CREATE INDEX idx_notification_jobs_type ON notification_jobs(type);
CREATE INDEX idx_notification_jobs_to_email ON notification_jobs(to_email);
CREATE INDEX idx_notification_jobs_created_at ON notification_jobs(created_at DESC);
CREATE INDEX idx_notification_jobs_tenant_id ON notification_jobs(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_notification_jobs_updated_at
  BEFORE UPDATE ON notification_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Notification Attempts Table
-- ============================================

CREATE TABLE notification_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to parent job
  notification_job_id UUID NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,

  -- Attempt details
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),

  -- Error details (null on success)
  error TEXT,

  -- Provider response
  provider_message_id TEXT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for notification_attempts
CREATE INDEX idx_notification_attempts_job_id ON notification_attempts(notification_job_id);
CREATE INDEX idx_notification_attempts_created_at ON notification_attempts(created_at DESC);

-- ============================================
-- Add availability_request_id to audit_logs (if not exists)
-- ============================================

-- Note: This column may already exist from availability requests implementation
-- Using IF NOT EXISTS pattern for safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'availability_request_id'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN availability_request_id UUID REFERENCES availability_requests(id) ON DELETE SET NULL;
    CREATE INDEX idx_audit_logs_availability_request_id ON audit_logs(availability_request_id);
  END IF;
END $$;

-- ============================================
-- Add availability_request_id to bookings (if not exists)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'availability_request_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN availability_request_id UUID REFERENCES availability_requests(id) ON DELETE SET NULL;
    CREATE INDEX idx_bookings_availability_request_id ON bookings(availability_request_id);
  END IF;
END $$;
