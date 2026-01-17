/**
 * Escalation Worker Service
 * Processes pending requests for nudges and coordinator escalations
 */

import { WorkerService, WorkerOptions } from './types';
import { WorkerResult } from '../cron/types';
import { processEscalations } from '../escalation/EscalationService';
import { getAllSchedulingRequests } from '../db';

class EscalationWorkerService implements WorkerService {
  /**
   * Process pending requests for escalation
   */
  async processBatch(_options?: WorkerOptions): Promise<WorkerResult> {
    try {
      const result = await processEscalations();

      // Get current queue depth
      const queueDepth = await this.getQueueDepth();

      return {
        processed: result.nudgesSent + result.escalationsSent + result.expired,
        failed: result.errors.length,
        skipped: result.processedCount - (result.nudgesSent + result.escalationsSent + result.expired) - result.errors.length,
        queueDepth,
        errors: result.errors.map((error, index) => ({
          itemId: `escalation-${index}`,
          error,
        })),
      };
    } catch (error) {
      const queueDepth = await this.getQueueDepth();
      return {
        processed: 0,
        failed: 1,
        skipped: 0,
        queueDepth,
        errors: [{
          itemId: 'escalation-process',
          error: error instanceof Error ? error.message : 'Unknown error',
        }],
      };
    }
  }

  /**
   * Get count of pending requests that may need escalation
   */
  async getQueueDepth(): Promise<number> {
    try {
      const allRequests = await getAllSchedulingRequests();
      const pendingRequests = allRequests.filter((r) => r.status === 'pending');
      return pendingRequests.length;
    } catch {
      return 0;
    }
  }
}

export const escalationWorkerService = new EscalationWorkerService();
