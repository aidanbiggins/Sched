-- Migration: 003_organizations.sql
-- M11: Organizations and RBAC for multi-tenant support
--
-- Run this migration in Supabase SQL Editor after 002_user_accounts.sql

-- ============================================
-- Organizations Table
-- ============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier

  -- Settings
  default_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  default_duration_minutes INTEGER NOT NULL DEFAULT 60,

  -- Limits
  max_members INTEGER DEFAULT 50,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Organization Members Table
-- ============================================

CREATE TYPE org_member_role AS ENUM ('admin', 'member');

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role org_member_role NOT NULL DEFAULT 'member',

  -- Invited by (null if founding member)
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One membership per org per user
  UNIQUE(organization_id, user_id)
);

-- Indexes
CREATE INDEX idx_org_members_org_id ON org_members(organization_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_role ON org_members(role);

-- Trigger
CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON org_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Update scheduling_requests to reference organization
-- ============================================

ALTER TABLE scheduling_requests
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_scheduling_requests_org_id
  ON scheduling_requests(organization_id);

-- ============================================
-- Update availability_requests to reference organization
-- ============================================

ALTER TABLE availability_requests
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_availability_requests_org_id
  ON availability_requests(organization_id);
