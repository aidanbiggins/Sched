/**
 * Unit tests for WebhookService (M6 Enhanced)
 */

import {
  WebhookService,
  generateWebhookSignature,
} from '@/lib/webhook/WebhookService';
import { resetDatabase, getWebhookEventByEventId, getAllAuditLogs, getWebhookEventByPayloadHash } from '@/lib/db';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    resetDatabase();
    service = new WebhookService();
  });

  describe('verifySignature', () => {
    it('verifies valid HMAC signature', () => {
      const payload = JSON.stringify({ eventId: '123', eventType: 'test' });
      const secret = 'test-secret';
      const signature = generateWebhookSignature(payload, secret);

      const result = service.verifySignature(payload, signature, secret);

      expect(result).toBe(true);
    });

    it('rejects invalid signature', () => {
      const payload = JSON.stringify({ eventId: '123', eventType: 'test' });
      const invalidSignature = 'invalid-signature';

      const result = service.verifySignature(payload, invalidSignature, 'secret');

      expect(result).toBe(false);
    });

    it('rejects tampered payload', () => {
      const originalPayload = JSON.stringify({ eventId: '123', eventType: 'test' });
      const secret = 'test-secret';
      const signature = generateWebhookSignature(originalPayload, secret);

      const tamperedPayload = JSON.stringify({ eventId: '456', eventType: 'test' });
      const result = service.verifySignature(tamperedPayload, signature, secret);

      expect(result).toBe(false);
    });
  });

  describe('generatePayloadHash', () => {
    it('generates consistent hash for same payload', () => {
      const data = { applicationId: 'APP-001', newStatus: 'Interview' };

      const hash1 = service.generatePayloadHash(data);
      const hash2 = service.generatePayloadHash(data);

      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different payloads', () => {
      const data1 = { applicationId: 'APP-001' };
      const data2 = { applicationId: 'APP-002' };

      const hash1 = service.generatePayloadHash(data1);
      const hash2 = service.generatePayloadHash(data2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('receiveWebhook', () => {
    it('stores webhook event', async () => {
      const payload = {
        eventId: 'evt-001',
        eventType: 'application.status_changed',
        timestamp: new Date().toISOString(),
        data: { applicationId: 'APP-001', newStatus: 'Interview' },
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawPayload, 'test-webhook-secret');

      const result = await service.receiveWebhook(payload, signature, rawPayload);

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.verified).toBe(true);

      const stored = await getWebhookEventByEventId('evt-001');
      expect(stored).toBeDefined();
      expect(stored?.eventType).toBe('application.status_changed');
      expect(stored?.verified).toBe(true);
      expect(stored?.status).toBe('received');
    });

    it('handles duplicate events by eventId (idempotency)', async () => {
      const payload = {
        eventId: 'evt-duplicate',
        eventType: 'test',
        timestamp: new Date().toISOString(),
        data: {},
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawPayload, 'test-webhook-secret');

      // First call
      const result1 = await service.receiveWebhook(payload, signature, rawPayload);
      expect(result1.isDuplicate).toBe(false);

      // Second call with same eventId
      const result2 = await service.receiveWebhook(payload, signature, rawPayload);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.message).toContain('duplicate');
    });

    it('handles duplicate events by payload hash (no eventId)', async () => {
      const data = { applicationId: 'APP-001', status: 'Interview' };
      const payload1 = {
        eventType: 'application.status_changed',
        data,
      };
      const payload2 = {
        eventType: 'application.status_changed',
        data, // Same data, no eventId
      };
      const rawPayload1 = JSON.stringify(payload1);
      const rawPayload2 = JSON.stringify(payload2);
      const signature1 = generateWebhookSignature(rawPayload1, 'test-webhook-secret');
      const signature2 = generateWebhookSignature(rawPayload2, 'test-webhook-secret');

      // First call
      const result1 = await service.receiveWebhook(payload1, signature1, rawPayload1);
      expect(result1.isDuplicate).toBe(false);

      // Second call with same payload hash
      const result2 = await service.receiveWebhook(payload2, signature2, rawPayload2);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.message).toContain('payload hash duplicate');
    });

    it('stores event even with invalid signature', async () => {
      const payload = {
        eventId: 'evt-invalid-sig',
        eventType: 'test',
        timestamp: new Date().toISOString(),
        data: {},
      };
      const rawPayload = JSON.stringify(payload);

      const result = await service.receiveWebhook(payload, 'invalid-signature', rawPayload);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
      expect(result.message).toContain('signature invalid');

      const stored = await getWebhookEventByEventId('evt-invalid-sig');
      expect(stored?.verified).toBe(false);
      expect(stored?.status).toBe('received');
    });

    it('logs webhook receipt to audit log', async () => {
      const payload = {
        eventId: 'evt-audit-log',
        eventType: 'candidate.updated',
        timestamp: new Date().toISOString(),
        data: { candidateId: 'CAND-001' },
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawPayload, 'test-webhook-secret');

      await service.receiveWebhook(payload, signature, rawPayload);

      const logs = await getAllAuditLogs();
      const webhookLog = logs.find(
        (log) => log.action === 'webhook_received' && log.payload?.externalEventId === 'evt-audit-log'
      );

      expect(webhookLog).toBeDefined();
      expect(webhookLog?.payload?.eventType).toBe('candidate.updated');
      expect(webhookLog?.payload?.verified).toBe(true);
    });

    it('logs webhook deduplication to audit log', async () => {
      const payload = {
        eventId: 'evt-dedup-audit',
        eventType: 'test',
        data: {},
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawPayload, 'test-webhook-secret');

      // First call
      await service.receiveWebhook(payload, signature, rawPayload);

      // Second call (duplicate)
      await service.receiveWebhook(payload, signature, rawPayload);

      const logs = await getAllAuditLogs();
      const dedupLog = logs.find(
        (log) => log.action === 'webhook_deduped' && log.payload?.externalEventId === 'evt-dedup-audit'
      );

      expect(dedupLog).toBeDefined();
    });
  });

  describe('processWebhookEvent', () => {
    it('processes verified webhook event', async () => {
      const payload = {
        eventId: 'evt-process',
        eventType: 'application.status_changed',
        data: { applicationId: 'APP-001' },
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawPayload, 'test-webhook-secret');

      // First receive the webhook
      await service.receiveWebhook(payload, signature, rawPayload);

      // Get the stored event
      const event = await getWebhookEventByEventId('evt-process');
      expect(event).toBeDefined();

      // Process it
      const result = await service.processWebhookEvent(event!);
      expect(result.success).toBe(true);

      // Check status updated
      const processed = await getWebhookEventByEventId('evt-process');
      expect(processed?.status).toBe('processed');
      expect(processed?.processedAt).toBeDefined();
    });

    it('rejects unverified webhook event', async () => {
      const payload = {
        eventId: 'evt-unverified',
        eventType: 'test',
        data: {},
      };
      const rawPayload = JSON.stringify(payload);

      // Receive with invalid signature
      await service.receiveWebhook(payload, 'invalid', rawPayload);

      // Get the stored event
      const event = await getWebhookEventByEventId('evt-unverified');
      expect(event?.verified).toBe(false);

      // Try to process
      const result = await service.processWebhookEvent(event!);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not verified');
    });
  });
});

describe('generateWebhookSignature', () => {
  it('generates consistent signatures', () => {
    const payload = '{"test": "data"}';
    const secret = 'secret';

    const sig1 = generateWebhookSignature(payload, secret);
    const sig2 = generateWebhookSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('generates different signatures for different payloads', () => {
    const secret = 'secret';

    const sig1 = generateWebhookSignature('{"a": 1}', secret);
    const sig2 = generateWebhookSignature('{"a": 2}', secret);

    expect(sig1).not.toBe(sig2);
  });

  it('generates different signatures for different secrets', () => {
    const payload = '{"test": "data"}';

    const sig1 = generateWebhookSignature(payload, 'secret1');
    const sig2 = generateWebhookSignature(payload, 'secret2');

    expect(sig1).not.toBe(sig2);
  });
});
