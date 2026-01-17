-- Migration: 006_scheduling_intelligence.sql
-- M15: Scheduling Intelligence & Capacity Planning
--
-- Run this migration in Supabase SQL Editor after 005_rls_policies.sql

-- ============================================
-- Interviewer Profiles Table
-- ============================================

CREATE TABLE interviewer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity linkage
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),

  -- Capacity settings
  max_interviews_per_week INTEGER DEFAULT 10,
  max_interviews_per_day INTEGER DEFAULT 3,
  max_concurrent_per_day INTEGER DEFAULT 2,
  buffer_minutes INTEGER DEFAULT 15,

  -- Preferences
  preferred_times JSONB DEFAULT '{}',
  blackout_dates JSONB DEFAULT '[]',
  interview_type_preferences TEXT[] DEFAULT '{}',

  -- Tags for matching
  tags TEXT[] DEFAULT '{}',
  skill_areas TEXT[] DEFAULT '{}',
  seniority_levels TEXT[] DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_capacity_override_at TIMESTAMP WITH TIME ZONE,
  last_capacity_override_by UUID REFERENCES users(id),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, email)
);

-- Indexes for interviewer_profiles
CREATE INDEX idx_interviewer_profiles_org ON interviewer_profiles(organization_id);
CREATE INDEX idx_interviewer_profiles_email ON interviewer_profiles(LOWER(email));
CREATE INDEX idx_interviewer_profiles_tags ON interviewer_profiles USING GIN(tags);
CREATE INDEX idx_interviewer_profiles_active ON interviewer_profiles(organization_id, is_active);

-- ============================================
-- Interviewer Load Rollups Table
-- ============================================

CREATE TABLE interviewer_load_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  interviewer_profile_id UUID NOT NULL REFERENCES interviewer_profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Time window
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- Interview counts
  scheduled_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  cancelled_count INTEGER DEFAULT 0,
  rescheduled_count INTEGER DEFAULT 0,

  -- Load metrics
  utilization_pct DECIMAL(5,2) DEFAULT 0,
  peak_day_count INTEGER DEFAULT 0,
  avg_daily_count DECIMAL(4,2) DEFAULT 0,

  -- Interview type breakdown
  by_interview_type JSONB DEFAULT '{}',

  -- Time distribution
  by_day_of_week JSONB DEFAULT '{}',
  by_hour_of_day JSONB DEFAULT '{}',

  -- Capacity alerts
  at_capacity BOOLEAN DEFAULT false,
  over_capacity BOOLEAN DEFAULT false,

  -- Computation metadata
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  computation_duration_ms INTEGER,

  UNIQUE(interviewer_profile_id, week_start)
);

-- Indexes for interviewer_load_rollups
CREATE INDEX idx_load_rollups_org_week ON interviewer_load_rollups(organization_id, week_start);
CREATE INDEX idx_load_rollups_at_capacity ON interviewer_load_rollups(organization_id, week_start, at_capacity);
CREATE INDEX idx_load_rollups_over_capacity ON interviewer_load_rollups(organization_id, week_start, over_capacity);
CREATE INDEX idx_load_rollups_profile ON interviewer_load_rollups(interviewer_profile_id);

-- ============================================
-- Scheduling Recommendations Table
-- ============================================

CREATE TABLE scheduling_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  organization_id UUID NOT NULL REFERENCES organizations(id),
  scheduling_request_id UUID REFERENCES scheduling_requests(id) ON DELETE CASCADE,
  availability_request_id UUID REFERENCES availability_requests(id) ON DELETE CASCADE,

  -- Recommendation details
  recommendation_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',

  -- Evidence
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB NOT NULL,

  -- Suggested action
  suggested_action TEXT,
  action_data JSONB,

  -- Status
  status TEXT DEFAULT 'active',
  dismissed_at TIMESTAMP WITH TIME ZONE,
  dismissed_by UUID REFERENCES users(id),
  dismissed_reason TEXT,
  acted_at TIMESTAMP WITH TIME ZONE,
  acted_by UUID REFERENCES users(id),

  -- TTL
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_priority CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'dismissed', 'acted', 'expired'))
);

-- Indexes for scheduling_recommendations
CREATE INDEX idx_recommendations_org_status ON scheduling_recommendations(organization_id, status);
CREATE INDEX idx_recommendations_request ON scheduling_recommendations(scheduling_request_id);
CREATE INDEX idx_recommendations_avail_request ON scheduling_recommendations(availability_request_id);
CREATE INDEX idx_recommendations_type ON scheduling_recommendations(organization_id, recommendation_type, status);
CREATE INDEX idx_recommendations_priority ON scheduling_recommendations(organization_id, priority, status);
CREATE INDEX idx_recommendations_expires ON scheduling_recommendations(expires_at) WHERE status = 'active';

-- ============================================
-- RLS Policies for New Tables
-- ============================================

ALTER TABLE interviewer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviewer_load_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_recommendations ENABLE ROW LEVEL SECURITY;

-- Interviewer Profiles: Users can view/manage profiles in their org
CREATE POLICY "users_view_org_interviewer_profiles" ON interviewer_profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "users_manage_org_interviewer_profiles" ON interviewer_profiles
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Load Rollups: Users can view rollups in their org
CREATE POLICY "users_view_org_load_rollups" ON interviewer_load_rollups
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Service role manages rollups
CREATE POLICY "service_manage_load_rollups" ON interviewer_load_rollups
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- Recommendations: Users can view recommendations in their org
CREATE POLICY "users_view_org_recommendations" ON scheduling_recommendations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Users can update (dismiss) recommendations in their org
CREATE POLICY "users_update_org_recommendations" ON scheduling_recommendations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Service role can manage recommendations
CREATE POLICY "service_manage_recommendations" ON scheduling_recommendations
  FOR ALL USING (
    auth.role() = 'service_role'
  );
