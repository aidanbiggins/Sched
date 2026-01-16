-- Migration: 002_user_accounts.sql
-- M7.5: User accounts and calendar connections for standalone mode
--
-- Run this migration in Supabase SQL Editor after 001_initial_schema.sql

-- ============================================
-- Users Table
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'coordinator' CHECK (role IN ('coordinator', 'interviewer', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Updated_at trigger
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Calendar Connections
-- ============================================

CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_id TEXT NOT NULL,
  email TEXT NOT NULL,

  -- OAuth tokens (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,

  -- Granted scopes
  scopes TEXT[],

  -- Primary calendar for this user
  is_primary BOOLEAN NOT NULL DEFAULT false,

  -- Connection status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One connection per provider per user
  UNIQUE(user_id, provider)
);

-- Indexes
CREATE INDEX idx_calendar_connections_user_id ON calendar_connections(user_id);
CREATE INDEX idx_calendar_connections_email ON calendar_connections(email);
CREATE INDEX idx_calendar_connections_status ON calendar_connections(status);

-- Updated_at trigger
CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Interviewer Invitations
-- ============================================

CREATE TABLE interviewer_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by UUID REFERENCES users(id),

  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_interviewer_invitations_email ON interviewer_invitations(email);
CREATE INDEX idx_interviewer_invitations_token ON interviewer_invitations(token);
CREATE INDEX idx_interviewer_invitations_status ON interviewer_invitations(status);

-- ============================================
-- Update scheduling_requests to reference coordinator
-- ============================================

-- Add coordinator_id column (nullable for backward compatibility)
ALTER TABLE scheduling_requests
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES users(id);

-- Add calendar_connection_id for which calendar to use
ALTER TABLE scheduling_requests
  ADD COLUMN IF NOT EXISTS calendar_connection_id UUID REFERENCES calendar_connections(id);

-- Index for coordinator lookups
CREATE INDEX IF NOT EXISTS idx_scheduling_requests_coordinator_id
  ON scheduling_requests(coordinator_id);
