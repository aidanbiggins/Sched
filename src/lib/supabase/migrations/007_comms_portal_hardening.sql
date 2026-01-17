-- Migration: 007_comms_portal_hardening.sql
-- M16: Communications & Portal Hardening
--
-- Run this migration in Supabase SQL Editor after 006_scheduling_intelligence.sql

-- ============================================
-- Extend notification_type enum with new types
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escalation_no_response';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escalation_expired';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coordinator_booking';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coordinator_cancel';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'interviewer_notification';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'interviewer_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'nudge_reminder';

-- ============================================
-- Escalation Config Table (org-level settings)
-- ============================================

CREATE TABLE IF NOT EXISTS escalation_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Timing settings (in hours)
  initial_reminder_hours INTEGER NOT NULL DEFAULT 48,
  second_reminder_hours INTEGER NOT NULL DEFAULT 96,
  escalate_to_coordinator_hours INTEGER NOT NULL DEFAULT 120,
  auto_expire_hours INTEGER NOT NULL DEFAULT 168,

  -- Feature toggles
  enable_reminders BOOLEAN NOT NULL DEFAULT true,
  enable_escalation BOOLEAN NOT NULL DEFAULT true,
  enable_auto_expire BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_config_org ON escalation_config(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_escalation_config_updated_at
  BEFORE UPDATE ON escalation_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Coordinator Notification Preferences Table
-- ============================================

CREATE TABLE IF NOT EXISTS coordinator_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Notification preferences
  notify_on_booking BOOLEAN NOT NULL DEFAULT true,
  notify_on_cancel BOOLEAN NOT NULL DEFAULT true,
  notify_on_escalation BOOLEAN NOT NULL DEFAULT true,
  digest_frequency TEXT NOT NULL DEFAULT 'immediate' CHECK (digest_frequency IN ('immediate', 'daily', 'weekly')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_coordinator_prefs_user ON coordinator_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_prefs_org ON coordinator_notification_preferences(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_coordinator_prefs_updated_at
  BEFORE UPDATE ON coordinator_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Extend scheduling_requests with escalation tracking
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduling_requests' AND column_name = 'first_reminder_sent_at'
  ) THEN
    ALTER TABLE scheduling_requests ADD COLUMN first_reminder_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduling_requests' AND column_name = 'second_reminder_sent_at'
  ) THEN
    ALTER TABLE scheduling_requests ADD COLUMN second_reminder_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduling_requests' AND column_name = 'escalated_at'
  ) THEN
    ALTER TABLE scheduling_requests ADD COLUMN escalated_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduling_requests' AND column_name = 'escalation_count'
  ) THEN
    ALTER TABLE scheduling_requests ADD COLUMN escalation_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- Extend availability_requests with escalation tracking
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'availability_requests' AND column_name = 'first_reminder_sent_at'
  ) THEN
    ALTER TABLE availability_requests ADD COLUMN first_reminder_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'availability_requests' AND column_name = 'second_reminder_sent_at'
  ) THEN
    ALTER TABLE availability_requests ADD COLUMN second_reminder_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'availability_requests' AND column_name = 'escalated_at'
  ) THEN
    ALTER TABLE availability_requests ADD COLUMN escalated_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'availability_requests' AND column_name = 'escalation_count'
  ) THEN
    ALTER TABLE availability_requests ADD COLUMN escalation_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- Index for efficient escalation queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_scheduling_requests_pending_escalation
  ON scheduling_requests(created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_availability_requests_pending_escalation
  ON availability_requests(created_at)
  WHERE status = 'pending';
