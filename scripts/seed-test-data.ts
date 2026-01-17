/**
 * Seed Test Data Script (M6)
 *
 * Creates sample data for development and testing.
 * Run with: npm run seed
 *
 * Creates:
 * - Sample scheduling requests in various states
 * - Sample bookings
 * - Sample webhook events
 * - Sample reconciliation jobs
 */

import { v4 as uuidv4 } from 'uuid';
import {
  createSchedulingRequest,
  createBooking,
  createWebhookEvent,
  createReconciliationJob,
  createAuditLog,
  updateSchedulingRequest,
} from '../src/lib/db';
import {
  SchedulingRequest,
  Booking,
  WebhookEvent,
  ReconciliationJob,
  AuditLog,
} from '../src/types/scheduling';

const now = new Date();
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

function createRequest(overrides: Partial<SchedulingRequest>): SchedulingRequest {
  const id = uuidv4();
  return {
    id,
    organizationId: null,
    applicationId: `app-${id.slice(0, 8)}`,
    candidateName: 'Test Candidate',
    candidateEmail: 'test@example.com',
    reqId: 'REQ-001',
    reqTitle: 'Software Engineer',
    interviewType: 'phone_screen',
    durationMinutes: 60,
    interviewerEmails: ['interviewer@company.com'],
    organizerEmail: 'organizer@company.com',
    calendarProvider: 'microsoft_graph',
    graphTenantId: 'test-tenant',
    windowStart: new Date(now.getTime() - 2 * dayMs),
    windowEnd: new Date(now.getTime() + 7 * dayMs),
    candidateTimezone: 'America/New_York',
    publicToken: `token-${id.slice(0, 8)}`,
    publicTokenHash: `hash-${id.slice(0, 8)}`,
    expiresAt: new Date(now.getTime() + 7 * dayMs),
    status: 'pending',
    needsAttention: false,
    needsAttentionReason: null,
    createdBy: null,
    createdAt: new Date(now.getTime() - Math.random() * 5 * dayMs),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createBookingData(requestId: string, overrides: Partial<Booking>): Booking {
  const id = uuidv4();
  return {
    id,
    requestId,
    scheduledStart: new Date(now.getTime() + dayMs),
    scheduledEnd: new Date(now.getTime() + dayMs + hourMs),
    calendarEventId: `cal-${id.slice(0, 8)}`,
    calendarIcalUid: null,
    conferenceJoinUrl: 'https://teams.microsoft.com/meet/test',
    icimsActivityId: null,
    status: 'confirmed',
    confirmedAt: new Date(),
    cancelledAt: null,
    cancellationReason: null,
    bookedBy: 'candidate',
    bookedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function seedData() {
  console.log('Seeding test data...\n');

  // Create requests in various states
  const pendingRequest1 = createRequest({
    candidateName: 'Alice Johnson',
    candidateEmail: 'alice@example.com',
    reqTitle: 'Senior Software Engineer',
    status: 'pending',
  });
  await createSchedulingRequest(pendingRequest1);
  console.log(`Created pending request: ${pendingRequest1.candidateName}`);

  const pendingRequest2 = createRequest({
    candidateName: 'Bob Smith',
    candidateEmail: 'bob@example.com',
    reqTitle: 'Product Manager',
    interviewType: 'hm_screen',
    status: 'pending',
  });
  await createSchedulingRequest(pendingRequest2);
  console.log(`Created pending request: ${pendingRequest2.candidateName}`);

  // Booked request with booking
  const bookedRequest = createRequest({
    candidateName: 'Carol Davis',
    candidateEmail: 'carol@example.com',
    reqTitle: 'UX Designer',
    status: 'booked',
  });
  await createSchedulingRequest(bookedRequest);
  const booking1 = createBookingData(bookedRequest.id, {
    icimsActivityId: 'ICIMS-12345',
  });
  await createBooking(booking1);
  console.log(`Created booked request: ${bookedRequest.candidateName}`);

  // Request needing attention
  const attentionRequest = createRequest({
    candidateName: 'David Wilson',
    candidateEmail: 'david@example.com',
    reqTitle: 'DevOps Engineer',
    status: 'booked',
    needsAttention: true,
    needsAttentionReason: 'iCIMS sync failed after 3 attempts',
  });
  await createSchedulingRequest(attentionRequest);
  const booking2 = createBookingData(attentionRequest.id, {
    icimsActivityId: null, // Missing iCIMS sync
  });
  await createBooking(booking2);
  console.log(`Created needs-attention request: ${attentionRequest.candidateName}`);

  // Cancelled request
  const cancelledRequest = createRequest({
    candidateName: 'Eve Martinez',
    candidateEmail: 'eve@example.com',
    reqTitle: 'Data Analyst',
    status: 'cancelled',
  });
  await createSchedulingRequest(cancelledRequest);
  console.log(`Created cancelled request: ${cancelledRequest.candidateName}`);

  // Create sample webhook events
  console.log('\nCreating webhook events...');

  const webhookReceived: WebhookEvent = {
    id: uuidv4(),
    tenantId: null,
    provider: 'icims',
    eventId: 'evt-' + uuidv4().slice(0, 8),
    payloadHash: 'hash-' + uuidv4().slice(0, 8),
    eventType: 'application.status_changed',
    payload: { applicationId: 'APP-001', newStatus: 'Interview' },
    signature: 'sig-test',
    verified: true,
    status: 'received',
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    runAfter: new Date(),
    processedAt: null,
    createdAt: new Date(now.getTime() - 5 * 60000),
    updatedAt: new Date(),
  };
  await createWebhookEvent(webhookReceived);
  console.log(`Created webhook: ${webhookReceived.eventType} (received)`);

  const webhookProcessed: WebhookEvent = {
    id: uuidv4(),
    tenantId: null,
    provider: 'icims',
    eventId: 'evt-' + uuidv4().slice(0, 8),
    payloadHash: 'hash-' + uuidv4().slice(0, 8),
    eventType: 'candidate.updated',
    payload: { candidateId: 'CAND-002', email: 'updated@example.com' },
    signature: 'sig-test',
    verified: true,
    status: 'processed',
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    runAfter: new Date(now.getTime() - hourMs),
    processedAt: new Date(now.getTime() - 30 * 60000),
    createdAt: new Date(now.getTime() - hourMs),
    updatedAt: new Date(),
  };
  await createWebhookEvent(webhookProcessed);
  console.log(`Created webhook: ${webhookProcessed.eventType} (processed)`);

  const webhookFailed: WebhookEvent = {
    id: uuidv4(),
    tenantId: null,
    provider: 'icims',
    eventId: 'evt-' + uuidv4().slice(0, 8),
    payloadHash: 'hash-' + uuidv4().slice(0, 8),
    eventType: 'requisition.updated',
    payload: { requisitionId: 'REQ-003' },
    signature: 'invalid-sig',
    verified: false,
    status: 'failed',
    attempts: 3,
    maxAttempts: 3,
    lastError: 'Signature verification failed',
    runAfter: new Date(now.getTime() - 2 * hourMs),
    processedAt: null,
    createdAt: new Date(now.getTime() - 2 * hourMs),
    updatedAt: new Date(),
  };
  await createWebhookEvent(webhookFailed);
  console.log(`Created webhook: ${webhookFailed.eventType} (failed)`);

  // Create sample reconciliation jobs
  console.log('\nCreating reconciliation jobs...');

  const reconciliationPending: ReconciliationJob = {
    id: uuidv4(),
    tenantId: null,
    jobType: 'icims_note_missing',
    entityType: 'booking',
    entityId: booking2.id,
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    detectionReason: 'Booking confirmed but no iCIMS note synced after 24h',
    runAfter: new Date(),
    createdAt: new Date(now.getTime() - 30 * 60000),
    updatedAt: new Date(),
  };
  await createReconciliationJob(reconciliationPending);
  console.log(`Created reconciliation: ${reconciliationPending.jobType} (pending)`);

  const reconciliationCompleted: ReconciliationJob = {
    id: uuidv4(),
    tenantId: null,
    jobType: 'state_mismatch',
    entityType: 'scheduling_request',
    entityId: bookedRequest.id,
    status: 'completed',
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    detectionReason: 'Request had confirmed booking but status was pending',
    runAfter: new Date(now.getTime() - hourMs),
    createdAt: new Date(now.getTime() - 2 * hourMs),
    updatedAt: new Date(now.getTime() - hourMs),
  };
  await createReconciliationJob(reconciliationCompleted);
  console.log(`Created reconciliation: ${reconciliationCompleted.jobType} (completed)`);

  const reconciliationFailed: ReconciliationJob = {
    id: uuidv4(),
    tenantId: null,
    jobType: 'calendar_event_missing',
    entityType: 'booking',
    entityId: booking1.id,
    status: 'failed',
    attempts: 3,
    maxAttempts: 3,
    lastError: 'Graph API unavailable',
    detectionReason: 'Booking confirmed but no calendar event created',
    runAfter: new Date(now.getTime() - 3 * hourMs),
    createdAt: new Date(now.getTime() - 5 * hourMs),
    updatedAt: new Date(now.getTime() - hourMs),
  };
  await createReconciliationJob(reconciliationFailed);
  console.log(`Created reconciliation: ${reconciliationFailed.jobType} (failed)`);

  // Create some audit logs
  console.log('\nCreating audit logs...');

  const auditLog1: AuditLog = {
    id: uuidv4(),
    requestId: bookedRequest.id,
    bookingId: booking1.id,
    action: 'booked',
    actorType: 'candidate',
    actorId: null,
    payload: { scheduledStart: booking1.scheduledStart.toISOString() },
    createdAt: new Date(now.getTime() - hourMs),
  };
  await createAuditLog(auditLog1);

  const auditLog2: AuditLog = {
    id: uuidv4(),
    requestId: attentionRequest.id,
    bookingId: null,
    action: 'needs_attention_set',
    actorType: 'system',
    actorId: null,
    payload: { reason: 'iCIMS sync failed after 3 attempts' },
    createdAt: new Date(now.getTime() - 30 * 60000),
  };
  await createAuditLog(auditLog2);

  console.log('Created 2 audit logs');

  console.log('\n✅ Seed data created successfully!');
  console.log('\nSummary:');
  console.log('- 5 scheduling requests');
  console.log('- 2 bookings');
  console.log('- 3 webhook events');
  console.log('- 3 reconciliation jobs');
  console.log('- 2 audit logs');
  console.log('\nVisit /ops to see the operator health dashboard.');
}

// Run if executed directly
seedData().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
