/**
 * Supabase Database Types
 *
 * This file should ideally be generated using:
 * npx supabase gen types typescript --project-id <project-ref> > src/lib/supabase/types.ts
 *
 * For now, we define the types manually to match our schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      scheduling_requests: {
        Row: {
          id: string;
          application_id: string | null;
          candidate_name: string;
          candidate_email: string;
          req_id: string | null;
          req_title: string;
          interview_type: string;
          duration_minutes: number;
          interviewer_emails: string[];
          organizer_email: string;
          calendar_provider: string;
          graph_tenant_id: string | null;
          window_start: string;
          window_end: string;
          candidate_timezone: string;
          public_token: string;
          public_token_hash: string;
          expires_at: string;
          status: string;
          needs_attention: boolean;
          needs_attention_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          candidate_name: string;
          candidate_email: string;
          req_id?: string | null;
          req_title: string;
          interview_type: string;
          duration_minutes: number;
          interviewer_emails: string[];
          organizer_email: string;
          calendar_provider?: string;
          graph_tenant_id?: string | null;
          window_start: string;
          window_end: string;
          candidate_timezone: string;
          public_token: string;
          public_token_hash: string;
          expires_at: string;
          status?: string;
          needs_attention?: boolean;
          needs_attention_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          candidate_name?: string;
          candidate_email?: string;
          req_id?: string | null;
          req_title?: string;
          interview_type?: string;
          duration_minutes?: number;
          interviewer_emails?: string[];
          organizer_email?: string;
          calendar_provider?: string;
          graph_tenant_id?: string | null;
          window_start?: string;
          window_end?: string;
          candidate_timezone?: string;
          public_token?: string;
          public_token_hash?: string;
          expires_at?: string;
          status?: string;
          needs_attention?: boolean;
          needs_attention_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          request_id: string;
          scheduled_start: string;
          scheduled_end: string;
          calendar_event_id: string | null;
          calendar_ical_uid: string | null;
          conference_join_url: string | null;
          icims_activity_id: string | null;
          status: string;
          confirmed_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          booked_by: string;
          booked_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          scheduled_start: string;
          scheduled_end: string;
          calendar_event_id?: string | null;
          calendar_ical_uid?: string | null;
          conference_join_url?: string | null;
          icims_activity_id?: string | null;
          status?: string;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          booked_by: string;
          booked_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          scheduled_start?: string;
          scheduled_end?: string;
          calendar_event_id?: string | null;
          calendar_ical_uid?: string | null;
          conference_join_url?: string | null;
          icims_activity_id?: string | null;
          status?: string;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          booked_by?: string;
          booked_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          request_id: string | null;
          booking_id: string | null;
          action: string;
          actor_type: string;
          actor_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id?: string | null;
          booking_id?: string | null;
          action: string;
          actor_type: string;
          actor_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string | null;
          booking_id?: string | null;
          action?: string;
          actor_type?: string;
          actor_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
      };
      sync_jobs: {
        Row: {
          id: string;
          type: string;
          entity_id: string;
          entity_type: string;
          attempts: number;
          max_attempts: number;
          status: string;
          last_error: string | null;
          payload: Json;
          run_after: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          entity_id: string;
          entity_type: string;
          attempts?: number;
          max_attempts?: number;
          status?: string;
          last_error?: string | null;
          payload?: Json;
          run_after?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          entity_id?: string;
          entity_type?: string;
          attempts?: number;
          max_attempts?: number;
          status?: string;
          last_error?: string | null;
          payload?: Json;
          run_after?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      webhook_events: {
        Row: {
          id: string;
          tenant_id: string | null;
          provider: string;
          event_id: string;
          payload_hash: string;
          event_type: string;
          payload: Json;
          signature: string;
          verified: boolean;
          status: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          run_after: string;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          provider?: string;
          event_id: string;
          payload_hash: string;
          event_type: string;
          payload: Json;
          signature: string;
          verified?: boolean;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          run_after?: string;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          provider?: string;
          event_id?: string;
          payload_hash?: string;
          event_type?: string;
          payload?: Json;
          signature?: string;
          verified?: boolean;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          run_after?: string;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reconciliation_jobs: {
        Row: {
          id: string;
          tenant_id: string | null;
          job_type: string;
          entity_type: string;
          entity_id: string;
          status: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          detection_reason: string;
          run_after: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          job_type: string;
          entity_type: string;
          entity_id: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          detection_reason: string;
          run_after?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          job_type?: string;
          entity_type?: string;
          entity_id?: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          detection_reason?: string;
          run_after?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      interviewer_identities: {
        Row: {
          id: string;
          tenant_id: string | null;
          email: string;
          calendar_provider_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          email: string;
          calendar_provider_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          email?: string;
          calendar_provider_user_id?: string | null;
          created_at?: string;
        };
      };
      tenant_configs: {
        Row: {
          id: string;
          graph_tenant_id: string;
          graph_client_id: string;
          graph_client_secret_ref: string;
          graph_organizer_email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          graph_tenant_id: string;
          graph_client_id: string;
          graph_client_secret_ref: string;
          graph_organizer_email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          graph_tenant_id?: string;
          graph_client_id?: string;
          graph_client_secret_ref?: string;
          graph_organizer_email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Helper types for easier access
export type SchedulingRequestRow = Database['public']['Tables']['scheduling_requests']['Row'];
export type SchedulingRequestInsert = Database['public']['Tables']['scheduling_requests']['Insert'];
export type SchedulingRequestUpdate = Database['public']['Tables']['scheduling_requests']['Update'];

export type BookingRow = Database['public']['Tables']['bookings']['Row'];
export type BookingInsert = Database['public']['Tables']['bookings']['Insert'];
export type BookingUpdate = Database['public']['Tables']['bookings']['Update'];

export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];

export type SyncJobRow = Database['public']['Tables']['sync_jobs']['Row'];
export type SyncJobInsert = Database['public']['Tables']['sync_jobs']['Insert'];
export type SyncJobUpdate = Database['public']['Tables']['sync_jobs']['Update'];

export type WebhookEventRow = Database['public']['Tables']['webhook_events']['Row'];
export type WebhookEventInsert = Database['public']['Tables']['webhook_events']['Insert'];
export type WebhookEventUpdate = Database['public']['Tables']['webhook_events']['Update'];

export type ReconciliationJobRow = Database['public']['Tables']['reconciliation_jobs']['Row'];
export type ReconciliationJobInsert = Database['public']['Tables']['reconciliation_jobs']['Insert'];
export type ReconciliationJobUpdate = Database['public']['Tables']['reconciliation_jobs']['Update'];

export type InterviewerIdentityRow = Database['public']['Tables']['interviewer_identities']['Row'];
export type InterviewerIdentityInsert = Database['public']['Tables']['interviewer_identities']['Insert'];

export type TenantConfigRow = Database['public']['Tables']['tenant_configs']['Row'];
export type TenantConfigInsert = Database['public']['Tables']['tenant_configs']['Insert'];
