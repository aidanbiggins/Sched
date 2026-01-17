-- Migration: 005_rls_policies.sql
-- M14: Row Level Security policies for multi-tenant isolation
--
-- Run this migration in Supabase SQL Editor after 004_notifications.sql

-- ============================================
-- Enable RLS on Core Tables
-- ============================================

ALTER TABLE scheduling_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- scheduling_requests Policies
-- ============================================

-- Users can view requests in their organization
CREATE POLICY "users_view_org_scheduling_requests" ON scheduling_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    -- Allow service role (for cron jobs)
    auth.role() = 'service_role'
  );

-- Users can insert requests in their organization
CREATE POLICY "users_insert_org_scheduling_requests" ON scheduling_requests
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Users can update requests in their organization
CREATE POLICY "users_update_org_scheduling_requests" ON scheduling_requests
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- ============================================
-- availability_requests Policies
-- ============================================

-- Users can view availability requests in their organization
CREATE POLICY "users_view_org_availability_requests" ON availability_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Users can insert availability requests in their organization
CREATE POLICY "users_insert_org_availability_requests" ON availability_requests
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Users can update availability requests in their organization
CREATE POLICY "users_update_org_availability_requests" ON availability_requests
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- ============================================
-- bookings Policies (via scheduling_requests FK)
-- ============================================

-- Users can view bookings for requests in their organization
CREATE POLICY "users_view_org_bookings" ON bookings
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM scheduling_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    availability_request_id IN (
      SELECT id FROM availability_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    auth.role() = 'service_role'
  );

-- Users can insert bookings for requests in their organization
CREATE POLICY "users_insert_org_bookings" ON bookings
  FOR INSERT WITH CHECK (
    request_id IN (
      SELECT id FROM scheduling_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    availability_request_id IN (
      SELECT id FROM availability_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    auth.role() = 'service_role'
  );

-- Users can update bookings for requests in their organization
CREATE POLICY "users_update_org_bookings" ON bookings
  FOR UPDATE USING (
    request_id IN (
      SELECT id FROM scheduling_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    availability_request_id IN (
      SELECT id FROM availability_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    auth.role() = 'service_role'
  );

-- ============================================
-- audit_logs Policies (via scheduling_requests FK)
-- ============================================

-- Users can view audit logs for requests in their organization
CREATE POLICY "users_view_org_audit_logs" ON audit_logs
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM scheduling_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
    OR
    auth.role() = 'service_role'
  );

-- Service role can insert audit logs
CREATE POLICY "service_insert_audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- ============================================
-- notification_jobs Policies
-- ============================================

-- Users can view notification jobs for their organization
-- Note: notification_jobs uses tenant_id as org identifier
CREATE POLICY "users_view_org_notification_jobs" ON notification_jobs
  FOR SELECT USING (
    tenant_id IN (
      SELECT organization_id::text FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Service role can manage notification jobs
CREATE POLICY "service_manage_notification_jobs" ON notification_jobs
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- ============================================
-- organizations Policies
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users can view organizations they are members of
CREATE POLICY "users_view_member_orgs" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Org admins can update their organizations
CREATE POLICY "admins_update_orgs" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    auth.role() = 'service_role'
  );

-- ============================================
-- org_members Policies
-- ============================================

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Users can view members of organizations they belong to
CREATE POLICY "users_view_org_members" ON org_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR
    auth.role() = 'service_role'
  );

-- Org admins can insert/update/delete members
CREATE POLICY "admins_manage_org_members" ON org_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    auth.role() = 'service_role'
  );

-- ============================================
-- Note: System tables remain open for service role
-- ============================================
-- These tables are managed by background workers:
-- - sync_jobs
-- - webhook_events
-- - reconciliation_jobs
-- - tenant_configs
-- - interviewer_identities
-- They use service_role access only and don't need user-level RLS.
