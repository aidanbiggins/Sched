/**
 * WebhookService (M6 Enhanced)
 *
 * Handles incoming webhooks from iCIMS and other external systems.
 * - Verifies HMAC signatures
 * - Stores events with idempotency (by eventId or payloadHash)
 * - Fast acknowledgment (stores and returns, processes async)
 */

import { createHmac, timingSafeEqual, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { WebhookEvent, AuditLog } from '@/types/scheduling';
import {
  createWebhookEvent,
  getWebhookEventByEventId,
  getWebhookEventByPayloadHash,
  updateWebhookEvent,
  createAuditLog,
} from '@/lib/db';

const WEBHOOK_SECRET = process.env.ICIMS_WEBHOOK_SECRET || 'test-webhook-secret';
const MAX_WEBHOOK_ATTEMPTS = 3;

export interface WebhookPayload {
  eventId?: string;         // Optional: external event ID
  eventType: string;
  timestamp?: string;
  data: Record<string, unknown>;
}

export interface WebhookResult {
  success: boolean;
  webhookId: string;
  eventId: string | null;
  message: string;
  isDuplicate: boolean;
  verified: boolean;
}

export class WebhookService {
  /**
   * Verify HMAC signature of incoming webhook
   */
  verifySignature(payload: string, signature: string, secret?: string): boolean {
    const webhookSecret = secret || WEBHOOK_SECRET;

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Generate SHA-256 hash of payload for deduplication
   */
  generatePayloadHash(payload: Record<string, unknown>): string {
    const normalized = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Process an incoming webhook event (fast ack - store only)
   */
  async receiveWebhook(
    payload: WebhookPayload,
    signature: string,
    rawPayload: string
  ): Promise<WebhookResult> {
    // Verify signature
    const verified = this.verifySignature(rawPayload, signature);

    // Generate payload hash for deduplication
    const payloadHash = this.generatePayloadHash(payload.data);

    // Check for duplicate by eventId (if provided)
    if (payload.eventId) {
      const existingByEventId = await getWebhookEventByEventId(payload.eventId);
      if (existingByEventId) {
        await this.logWebhookDeduped(existingByEventId);
        return {
          success: true,
          webhookId: existingByEventId.id,
          eventId: payload.eventId,
          message: 'Event already received (eventId duplicate)',
          isDuplicate: true,
          verified,
        };
      }
    }

    // Check for duplicate by payload hash
    const existingByHash = await getWebhookEventByPayloadHash(null, 'icims', payloadHash);
    if (existingByHash) {
      await this.logWebhookDeduped(existingByHash);
      return {
        success: true,
        webhookId: existingByHash.id,
        eventId: existingByHash.eventId,
        message: 'Event already received (payload hash duplicate)',
        isDuplicate: true,
        verified,
      };
    }

    // Store the event
    const webhookId = uuidv4();
    const webhookEvent: WebhookEvent = {
      id: webhookId,
      tenantId: null,                    // Single-tenant for now
      provider: 'icims',
      eventId: payload.eventId || webhookId, // Use webhook ID if no external ID
      payloadHash,
      eventType: payload.eventType,
      payload: payload.data,
      signature,
      verified,
      status: 'received',                // Ready for async processing
      attempts: 0,
      maxAttempts: MAX_WEBHOOK_ATTEMPTS,
      lastError: null,
      runAfter: new Date(),              // Process immediately
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await createWebhookEvent(webhookEvent);

    // Log to audit log
    await this.logWebhookReceived(webhookEvent);

    return {
      success: true,
      webhookId,
      eventId: payload.eventId || null,
      message: verified ? 'Event received and queued for processing' : 'Event received (signature invalid)',
      isDuplicate: false,
      verified,
    };
  }

  /**
   * Process a single webhook event (called by processor worker)
   */
  async processWebhookEvent(event: WebhookEvent): Promise<{ success: boolean; error?: string }> {
    if (!event.verified) {
      return { success: false, error: 'Webhook signature not verified' };
    }

    try {
      // Handle specific event types
      await this.handleEvent(event);

      // Mark as processed
      await updateWebhookEvent(event.id, {
        status: 'processed',
        processedAt: new Date(),
      });

      // Log success
      await this.logWebhookProcessed(event);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Increment attempts
      const newAttempts = event.attempts + 1;

      if (newAttempts >= event.maxAttempts) {
        // Mark as failed
        await updateWebhookEvent(event.id, {
          status: 'failed',
          attempts: newAttempts,
          lastError: errorMessage,
        });

        // Log failure
        await this.logWebhookFailed(event, errorMessage);
      } else {
        // Schedule retry with backoff
        const backoffMs = Math.pow(2, newAttempts) * 60000; // 2^n minutes
        await updateWebhookEvent(event.id, {
          status: 'received',
          attempts: newAttempts,
          lastError: errorMessage,
          runAfter: new Date(Date.now() + backoffMs),
        });
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle specific event types
   */
  private async handleEvent(event: WebhookEvent): Promise<void> {
    switch (event.eventType) {
      case 'application.status_changed':
        // TODO: Handle application status changes (future: auto-create scheduling requests)
        console.log('[Webhook] Application status changed:', event.payload);
        break;

      case 'candidate.updated':
        // TODO: Handle candidate updates
        console.log('[Webhook] Candidate updated:', event.payload);
        break;

      case 'requisition.updated':
        // TODO: Handle requisition updates
        console.log('[Webhook] Requisition updated:', event.payload);
        break;

      default:
        console.log(`[Webhook] Unknown event type: ${event.eventType}`);
    }
  }

  /**
   * Log webhook receipt to audit log
   */
  private async logWebhookReceived(event: WebhookEvent): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'webhook_received',
      actorType: 'system',
      actorId: null,
      payload: {
        webhookEventId: event.id,
        externalEventId: event.eventId,
        eventType: event.eventType,
        provider: event.provider,
        verified: event.verified,
        payloadHash: event.payloadHash,
      },
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }

  /**
   * Log webhook deduplication to audit log
   */
  private async logWebhookDeduped(event: WebhookEvent): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'webhook_deduped',
      actorType: 'system',
      actorId: null,
      payload: {
        webhookEventId: event.id,
        externalEventId: event.eventId,
        eventType: event.eventType,
        provider: event.provider,
      },
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }

  /**
   * Log webhook processed to audit log
   */
  private async logWebhookProcessed(event: WebhookEvent): Promise<void> {
    // Extract normalized fields for audit
    const normalizedFields: Record<string, unknown> = {
      webhookEventId: event.id,
      eventType: event.eventType,
    };

    // Safely extract common fields
    const data = event.payload as Record<string, unknown>;
    if (data.applicationId) normalizedFields.icimsApplicationId = data.applicationId;
    if (data.candidateEmail) normalizedFields.candidateEmail = data.candidateEmail;
    if (data.requisitionId) normalizedFields.requisitionId = data.requisitionId;

    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'webhook_processed',
      actorType: 'system',
      actorId: null,
      payload: normalizedFields,
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }

  /**
   * Log webhook failure to audit log
   */
  private async logWebhookFailed(event: WebhookEvent, errorMessage: string): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'webhook_failed',
      actorType: 'system',
      actorId: null,
      payload: {
        webhookEventId: event.id,
        eventType: event.eventType,
        error: errorMessage.substring(0, 500),
        attempts: event.attempts + 1,
      },
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }
}

/**
 * Generate HMAC signature for a payload (for testing)
 */
export function generateWebhookSignature(
  payload: string,
  secret?: string
): string {
  const webhookSecret = secret || WEBHOOK_SECRET;
  return createHmac('sha256', webhookSecret).update(payload).digest('hex');
}

// Export singleton
let instance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!instance) {
    instance = new WebhookService();
  }
  return instance;
}
