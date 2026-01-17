/**
 * Cron Endpoint: Capacity
 * Computes weekly load rollups and generates recommendations
 *
 * Vercel Cron: Weekly on Mondays at 6am UTC (or daily if needed)
 * Manual: POST /api/cron/capacity with Authorization: Bearer <CRON_SECRET>
 */

import { createCronHandler } from '@/lib/cron';
import { capacityWorkerService } from '@/lib/workers';

export const GET = createCronHandler('capacity', capacityWorkerService);
export const POST = createCronHandler('capacity', capacityWorkerService);

// Allow up to 300 seconds for processing (many profiles)
export const maxDuration = 300;
