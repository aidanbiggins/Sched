/**
 * Supabase Client Setup
 *
 * Provides a configured Supabase client for database operations.
 * Uses service role key for server-side operations (bypasses RLS).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use generic types for flexibility until we generate proper types from Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseDatabase = any;

let supabaseInstance: SupabaseClient<SupabaseDatabase> | null = null;

/**
 * Get or create the Supabase client instance.
 * Uses singleton pattern to reuse connections.
 */
export function getSupabaseClient(): SupabaseClient<SupabaseDatabase> {
  // Temporarily disable singleton to debug caching issues
  // if (supabaseInstance) {
  //   return supabaseInstance;
  // }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  // Create fresh client each time to avoid caching issues
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  });
}

/**
 * Reset the Supabase client instance.
 * Useful for testing or reconnecting with new credentials.
 */
export function resetSupabaseClient(): void {
  supabaseInstance = null;
}
