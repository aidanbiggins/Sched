/**
 * Run Reconciliation API
 *
 * Triggers detection and processing of reconciliation jobs.
 * Only available in non-production environments.
 */

import { NextResponse } from 'next/server';
import { ReconciliationService } from '@/lib/reconciliation/ReconciliationService';
import { getReconciliationJobsFiltered } from '@/lib/db';

export async function POST() {
  // Block in production (require explicit confirmation there)
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Use the ops dashboard for production reconciliation' },
      { status: 403 }
    );
  }

  try {
    const service = new ReconciliationService();

    // Run detection to create jobs for issues
    const detectionResults = await service.runDetection();

    // Get pending jobs and process them
    const pendingJobs = await getReconciliationJobsFiltered(
      { status: ['pending'] },
      { page: 1, limit: 10 }
    );

    let processed = 0;
    for (const job of pendingJobs.data) {
      try {
        await service.processJob(job);
        processed++;
      } catch {
        // Continue processing other jobs
      }
    }

    return NextResponse.json({
      message: `Detected ${detectionResults.length} issues, processed ${processed} jobs`,
      detected: detectionResults.length,
      processed,
    });
  } catch (error) {
    console.error('Reconciliation run error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run reconciliation' },
      { status: 500 }
    );
  }
}
