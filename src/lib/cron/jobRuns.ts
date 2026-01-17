/**
 * Job Run Logging Service
 * Records execution history for cron jobs
 */

import { v4 as uuidv4 } from 'uuid';
import {
  JobName,
  JobRun,
  JobRunStatus,
  CreateJobRunInput,
  UpdateJobRunInput,
} from './types';

// ============================================
// In-Memory Store (for memory mode)
// ============================================

const memoryJobRuns: JobRun[] = [];

// ============================================
// Job Run Service Interface
// ============================================

export interface JobRunService {
  create(input: CreateJobRunInput): Promise<JobRun>;
  update(id: string, input: UpdateJobRunInput): Promise<JobRun | null>;
  getById(id: string): Promise<JobRun | null>;
  getLatestByJob(jobName: JobName): Promise<JobRun | null>;
  getRecent(limit?: number): Promise<JobRun[]>;
  getByJobName(jobName: JobName, limit?: number): Promise<JobRun[]>;
  getFailureRate24h(jobName: JobName): Promise<number>;
}

// ============================================
// Memory Implementation
// ============================================

export const memoryJobRunService: JobRunService = {
  async create(input: CreateJobRunInput): Promise<JobRun> {
    const now = new Date();
    const jobRun: JobRun = {
      id: uuidv4(),
      jobName: input.jobName,
      startedAt: now,
      finishedAt: null,
      durationMs: null,
      status: 'running',
      processed: 0,
      failed: 0,
      skipped: 0,
      queueDepthBefore: input.queueDepthBefore ?? null,
      queueDepthAfter: null,
      triggeredBy: input.triggeredBy,
      instanceId: input.instanceId,
      errorSummary: null,
      errorDetails: null,
      createdAt: now,
    };
    memoryJobRuns.unshift(jobRun);
    return jobRun;
  },

  async update(id: string, input: UpdateJobRunInput): Promise<JobRun | null> {
    const index = memoryJobRuns.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const updated: JobRun = {
      ...memoryJobRuns[index],
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      status: input.status,
      processed: input.processed,
      failed: input.failed,
      skipped: input.skipped,
      queueDepthAfter: input.queueDepthAfter ?? null,
      errorSummary: input.errorSummary ?? null,
      errorDetails: input.errorDetails ?? null,
    };
    memoryJobRuns[index] = updated;
    return updated;
  },

  async getById(id: string): Promise<JobRun | null> {
    return memoryJobRuns.find((r) => r.id === id) ?? null;
  },

  async getLatestByJob(jobName: JobName): Promise<JobRun | null> {
    const runs = memoryJobRuns
      .filter((r) => r.jobName === jobName)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return runs[0] ?? null;
  },

  async getRecent(limit = 50): Promise<JobRun[]> {
    return memoryJobRuns
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  },

  async getByJobName(jobName: JobName, limit = 20): Promise<JobRun[]> {
    return memoryJobRuns
      .filter((r) => r.jobName === jobName)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  },

  async getFailureRate24h(jobName: JobName): Promise<number> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const runs = memoryJobRuns.filter(
      (r) => r.jobName === jobName && r.startedAt >= dayAgo && r.status !== 'running'
    );
    if (runs.length === 0) return 0;
    const failed = runs.filter((r) => r.status === 'failed').length;
    return failed / runs.length;
  },
};

// ============================================
// Supabase Implementation
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

function mapToJobRun(row: Record<string, unknown>): JobRun {
  return {
    id: row.id as string,
    jobName: row.job_name as JobName,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    durationMs: row.duration_ms as number | null,
    status: row.status as JobRunStatus,
    processed: row.processed as number,
    failed: row.failed as number,
    skipped: row.skipped as number,
    queueDepthBefore: row.queue_depth_before as number | null,
    queueDepthAfter: row.queue_depth_after as number | null,
    triggeredBy: row.triggered_by as JobRun['triggeredBy'],
    instanceId: row.instance_id as string,
    errorSummary: row.error_summary as string | null,
    errorDetails: row.error_details as Record<string, unknown> | null,
    createdAt: new Date(row.created_at as string),
  };
}

export const supabaseJobRunService: JobRunService = {
  async create(input: CreateJobRunInput): Promise<JobRun> {
    const supabase = getSupabaseClient();
    const now = new Date();

    const { data, error } = await supabase
      .from('job_runs')
      .insert({
        job_name: input.jobName,
        started_at: now.toISOString(),
        status: 'running',
        processed: 0,
        failed: 0,
        skipped: 0,
        queue_depth_before: input.queueDepthBefore ?? null,
        triggered_by: input.triggeredBy,
        instance_id: input.instanceId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create job run: ${error.message}`);
    return mapToJobRun(data);
  },

  async update(id: string, input: UpdateJobRunInput): Promise<JobRun | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('job_runs')
      .update({
        finished_at: input.finishedAt.toISOString(),
        duration_ms: input.durationMs,
        status: input.status,
        processed: input.processed,
        failed: input.failed,
        skipped: input.skipped,
        queue_depth_after: input.queueDepthAfter ?? null,
        error_summary: input.errorSummary ?? null,
        error_details: input.errorDetails ?? null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[JobRun] Update error:', error);
      return null;
    }
    return mapToJobRun(data);
  },

  async getById(id: string): Promise<JobRun | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('job_runs')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return mapToJobRun(data);
  },

  async getLatestByJob(jobName: JobName): Promise<JobRun | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('job_runs')
      .select()
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return mapToJobRun(data);
  },

  async getRecent(limit = 50): Promise<JobRun[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('job_runs')
      .select()
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[JobRun] getRecent error:', error);
      return [];
    }
    return (data || []).map(mapToJobRun);
  },

  async getByJobName(jobName: JobName, limit = 20): Promise<JobRun[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('job_runs')
      .select()
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[JobRun] getByJobName error:', error);
      return [];
    }
    return (data || []).map(mapToJobRun);
  },

  async getFailureRate24h(jobName: JobName): Promise<number> {
    const supabase = getSupabaseClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('job_runs')
      .select('status')
      .eq('job_name', jobName)
      .gte('started_at', dayAgo.toISOString())
      .neq('status', 'running');

    if (error || !data || data.length === 0) return 0;
    const failed = data.filter((r) => r.status === 'failed').length;
    return failed / data.length;
  },
};

// ============================================
// Factory Function
// ============================================

export function getJobRunService(): JobRunService {
  const isSupabase = process.env.DB_MODE === 'supabase';
  return isSupabase ? supabaseJobRunService : memoryJobRunService;
}

// ============================================
// Reset (for testing)
// ============================================

export function resetMemoryJobRuns(): void {
  memoryJobRuns.length = 0;
}
