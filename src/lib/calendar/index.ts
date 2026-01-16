/**
 * Calendar Client Factory
 *
 * Creates the appropriate calendar client based on the provider.
 */

export * from './types';
export { GoogleCalendarClient } from './GoogleCalendarClient';
export { MicrosoftCalendarClient } from './MicrosoftCalendarClient';

import { getSupabaseClient } from '../supabase/client';
import { GoogleCalendarClient } from './GoogleCalendarClient';
import { MicrosoftCalendarClient } from './MicrosoftCalendarClient';
import type { CalendarClient } from './types';

/**
 * Get a calendar client for a user
 *
 * @param userId - The user's ID
 * @param provider - Optional provider preference ('google' | 'microsoft')
 * @returns A calendar client instance
 */
export async function getCalendarClient(
  userId: string,
  provider?: 'google' | 'microsoft'
): Promise<CalendarClient> {
  const supabase = getSupabaseClient();

  // Build query
  let query = supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (provider) {
    query = query.eq('provider', provider);
  } else {
    // Prefer primary connection
    query = query.order('is_primary', { ascending: false });
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    throw new Error('No active calendar connection found');
  }

  if (data.provider === 'google') {
    return GoogleCalendarClient.fromUserId(userId);
  }

  if (data.provider === 'microsoft') {
    return MicrosoftCalendarClient.fromUserId(userId);
  }

  throw new Error(`Unknown calendar provider: ${data.provider}`);
}

/**
 * Check if a user has any active calendar connections
 */
export async function hasCalendarConnection(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('calendar_connections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('Error checking calendar connections:', error);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Get all calendar connections for a user
 */
export async function getUserCalendarConnections(userId: string): Promise<
  Array<{
    id: string;
    provider: 'google' | 'microsoft';
    email: string;
    isPrimary: boolean;
    status: 'active' | 'expired' | 'revoked';
  }>
> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, provider, email, is_primary, status')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching calendar connections:', error);
    return [];
  }

  return data.map((c) => ({
    id: c.id,
    provider: c.provider as 'google' | 'microsoft',
    email: c.email,
    isPrimary: c.is_primary,
    status: c.status as 'active' | 'expired' | 'revoked',
  }));
}
