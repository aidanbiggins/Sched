/**
 * Cron Endpoint: Sync
 * Processes pending sync jobs (iCIMS writebacks)
 *
 * Vercel Cron: Every 5 minutes
 * Manual: POST /api/cron/sync with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { syncWorkerService } from '@/lib/workers';

export const GET = createCronHandler('sync', syncWorkerService);
export const POST = createCronHandler('sync', syncWorkerService);

// Allow up to 60 seconds for processing
export const maxDuration = 60;
