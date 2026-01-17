/**
 * Distributed Lock Service for Cron Jobs
 * Ensures at-most-one execution per job type
 */

import { JobName, JobLock } from './types';

// Default lock TTL: 2 minutes
const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;

// ============================================
// In-Memory Lock Store (for memory mode)
// ============================================

const memoryLocks = new Map<JobName, JobLock>();

// ============================================
// Lock Interface
// ============================================

export interface LockService {
  acquire(jobName: JobName, instanceId: string, ttlMs?: number): Promise<boolean>;
  release(jobName: JobName, instanceId: string): Promise<boolean>;
  isHeld(jobName: JobName): Promise<boolean>;
  getHolder(jobName: JobName): Promise<JobLock | null>;
}

// ============================================
// Memory Lock Implementation
// ============================================

export const memoryLockService: LockService = {
  async acquire(jobName: JobName, instanceId: string, ttlMs = DEFAULT_LOCK_TTL_MS): Promise<boolean> {
    const now = new Date();
    const existing = memoryLocks.get(jobName);

    // Check if lock exists and is not expired
    if (existing && existing.expiresAt > now) {
      // Lock is held by someone else
      if (existing.lockedBy !== instanceId) {
        return false;
      }
      // Same instance - extend lock
    }

    // Acquire or extend lock
    memoryLocks.set(jobName, {
      jobName,
      lockedBy: instanceId,
      lockedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    });

    return true;
  },

  async release(jobName: JobName, instanceId: string): Promise<boolean> {
    const existing = memoryLocks.get(jobName);

    if (!existing) {
      return true; // Already released
    }

    if (existing.lockedBy !== instanceId) {
      return false; // Not our lock
    }

    memoryLocks.delete(jobName);
    return true;
  },

  async isHeld(jobName: JobName): Promise<boolean> {
    const existing = memoryLocks.get(jobName);
    if (!existing) return false;
    return existing.expiresAt > new Date();
  },

  async getHolder(jobName: JobName): Promise<JobLock | null> {
    const existing = memoryLocks.get(jobName);
    if (!existing) return null;
    if (existing.expiresAt <= new Date()) {
      memoryLocks.delete(jobName);
      return null;
    }
    return existing;
  },
};

// ============================================
// Supabase Lock Implementation (table-based)
// ============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(url, key);
}

export const supabaseLockService: LockService = {
  async acquire(jobName: JobName, instanceId: string, ttlMs = DEFAULT_LOCK_TTL_MS): Promise<boolean> {
    const supabase = getSupabaseClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Try to insert or update if expired
    const { data, error } = await supabase
      .from('job_locks')
      .upsert(
        {
          job_name: jobName,
          locked_by: instanceId,
          locked_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        {
          onConflict: 'job_name',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      // Check if it's a conflict due to unexpired lock
      if (error.code === '23505' || error.message.includes('duplicate')) {
        // Check if existing lock is expired
        const { data: existing } = await supabase
          .from('job_locks')
          .select()
          .eq('job_name', jobName)
          .single();

        if (existing && new Date(existing.expires_at) > now) {
          // Lock is held by someone else
          return existing.locked_by === instanceId;
        }

        // Lock is expired, try to take it
        const { error: updateError } = await supabase
          .from('job_locks')
          .update({
            locked_by: instanceId,
            locked_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          })
          .eq('job_name', jobName)
          .lt('expires_at', now.toISOString());

        return !updateError;
      }
      console.error('[Lock] Acquire error:', error);
      return false;
    }

    return !!data;
  },

  async release(jobName: JobName, instanceId: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('job_locks')
      .delete()
      .eq('job_name', jobName)
      .eq('locked_by', instanceId);

    if (error) {
      console.error('[Lock] Release error:', error);
      return false;
    }

    return true;
  },

  async isHeld(jobName: JobName): Promise<boolean> {
    const supabase = getSupabaseClient();
    const now = new Date();

    const { data } = await supabase
      .from('job_locks')
      .select('expires_at')
      .eq('job_name', jobName)
      .single();

    if (!data) return false;
    return new Date(data.expires_at) > now;
  },

  async getHolder(jobName: JobName): Promise<JobLock | null> {
    const supabase = getSupabaseClient();
    const now = new Date();

    const { data, error } = await supabase
      .from('job_locks')
      .select()
      .eq('job_name', jobName)
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) <= now) {
      return null;
    }

    return {
      jobName: data.job_name as JobName,
      lockedBy: data.locked_by,
      lockedAt: new Date(data.locked_at),
      expiresAt: new Date(data.expires_at),
    };
  },
};

// ============================================
// Factory Function
// ============================================

export function getLockService(): LockService {
  const isSupabase = process.env.DB_MODE === 'supabase';
  return isSupabase ? supabaseLockService : memoryLockService;
}

// ============================================
// Reset (for testing)
// ============================================

export function resetMemoryLocks(): void {
  memoryLocks.clear();
}
