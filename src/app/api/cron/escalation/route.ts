/**
 * Cron Endpoint: Escalation
 * Processes pending requests for nudges and coordinator escalations
 *
 * Vercel Cron: Every 1 hour
 * Manual: POST /api/cron/escalation with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { escalationWorkerService } from '@/lib/workers';

export const GET = createCronHandler('escalation', escalationWorkerService);
export const POST = createCronHandler('escalation', escalationWorkerService);

// Allow up to 60 seconds for processing
export const maxDuration = 60;
