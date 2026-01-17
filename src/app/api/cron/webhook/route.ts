/**
 * Cron Endpoint: Webhook
 * Processes pending webhook events
 *
 * Vercel Cron: Every 5 minutes
 * Manual: POST /api/cron/webhook with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { webhookWorkerService } from '@/lib/workers';

export const GET = createCronHandler('webhook', webhookWorkerService);
export const POST = createCronHandler('webhook', webhookWorkerService);

// Allow up to 60 seconds for processing
export const maxDuration = 60;
