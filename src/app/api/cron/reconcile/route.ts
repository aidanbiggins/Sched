/**
 * Cron Endpoint: Reconcile
 * Runs detection and processes pending reconciliation jobs
 *
 * Vercel Cron: Every 15 minutes
 * Manual: POST /api/cron/reconcile with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { reconcileWorkerService } from '@/lib/workers';

export const GET = createCronHandler('reconcile', reconcileWorkerService);
export const POST = createCronHandler('reconcile', reconcileWorkerService);

// Allow up to 120 seconds for processing (detection + job processing)
export const maxDuration = 120;
