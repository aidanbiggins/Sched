/**
 * Cron Endpoint: Notify
 * Processes pending notification jobs
 *
 * Vercel Cron: Every 1 minute
 * Manual: POST /api/cron/notify with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { notifyWorkerService } from '@/lib/workers';

export const GET = createCronHandler('notify', notifyWorkerService);
export const POST = createCronHandler('notify', notifyWorkerService);

// Allow up to 60 seconds for processing
export const maxDuration = 60;
