/**
 * API Route: /api/ops/health
 *
 * GET - Get operator health summary (M6)
 *
 * Returns:
 * - Webhook stats (received, processing, failed)
 * - Reconciliation stats (pending, completed, failed)
 * - Needs attention count
 * - System status
 */

import { NextResponse } from 'next/server';
import {
  getWebhookEventCounts,
  getReconciliationJobCounts,
  getNeedsAttentionCount,
  getSchedulingRequestCounts,
  getNotificationJobCounts,
} from '@/lib/db';

export async function GET() {
  try {
    // Get webhook stats (last 24 hours)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const webhookCounts = await getWebhookEventCounts(since);

    // Get reconciliation stats
    const reconciliationCounts = await getReconciliationJobCounts();

    // Get needs attention count
    const needsAttentionCount = await getNeedsAttentionCount();

    // Get request counts
    const requestCounts = await getSchedulingRequestCounts();

    // Get notification stats (gracefully handle if table doesn't exist yet)
    let notificationCounts = { pending: 0, sending: 0, sent: 0, failed: 0, canceled: 0 };
    try {
      notificationCounts = await getNotificationJobCounts();
    } catch (notifError) {
      console.warn('Could not fetch notification counts (table may not exist):', notifError);
    }

    // Calculate system health status
    const hasFailures = webhookCounts.failed > 0 || reconciliationCounts.failed > 0 || notificationCounts.failed > 0;
    const hasAttention = needsAttentionCount > 0;
    const systemStatus = hasFailures || hasAttention ? 'degraded' : 'healthy';

    return NextResponse.json({
      status: systemStatus,
      timestamp: new Date().toISOString(),
      webhooks: {
        last24h: {
          received: webhookCounts.received,
          processing: webhookCounts.processing,
          processed: webhookCounts.processed,
          failed: webhookCounts.failed,
        },
      },
      reconciliation: {
        pending: reconciliationCounts.pending,
        processing: reconciliationCounts.processing,
        completed: reconciliationCounts.completed,
        failed: reconciliationCounts.failed,
        requiresAttention: reconciliationCounts.requires_attention,
      },
      requests: {
        byStatus: requestCounts,
        needsAttention: needsAttentionCount,
      },
      notifications: {
        pending: notificationCounts.pending,
        sending: notificationCounts.sending,
        sent: notificationCounts.sent,
        failed: notificationCounts.failed,
        canceled: notificationCounts.canceled,
      },
    });
  } catch (error) {
    console.error('Error fetching health status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health status' },
      { status: 500 }
    );
  }
}
