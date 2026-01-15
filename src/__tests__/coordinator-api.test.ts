/**
 * Tests for Coordinator API endpoints (M5)
 */

import {
  createSchedulingRequest,
  getSchedulingRequestsFiltered,
  getSchedulingRequestCounts,
  createSyncJob,
  resetDatabase,
} from '@/lib/db';
import { SchedulingRequest, SyncJob } from '@/types/scheduling';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

describe('Coordinator API - Filtering and Pagination', () => {
  beforeEach(() => {
    resetDatabase();
  });

  function createMockRequest(overrides: Partial<SchedulingRequest> = {}): SchedulingRequest {
    const id = uuidv4();
    const token = uuidv4();
    return {
      id,
      applicationId: `APP-${Math.floor(Math.random() * 10000)}`,
      candidateName: 'Test Candidate',
      candidateEmail: `candidate${Math.random()}@example.com`,
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      durationMinutes: 60,
      interviewerEmails: ['interviewer@company.com'],
      organizerEmail: 'organizer@company.com',
      status: 'pending',
      publicToken: token,
      publicTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      candidateTimezone: 'America/New_York',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('getSchedulingRequestsFiltered', () => {
    it('should return all requests when no filters applied', async () => {
      await createSchedulingRequest(createMockRequest());
      await createSchedulingRequest(createMockRequest());
      await createSchedulingRequest(createMockRequest());

      const result = await getSchedulingRequestsFiltered({});
      expect(result.data.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should filter by status', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'pending' }));
      await createSchedulingRequest(createMockRequest({ status: 'booked' }));
      await createSchedulingRequest(createMockRequest({ status: 'cancelled' }));

      const pendingResult = await getSchedulingRequestsFiltered({ status: ['pending'] });
      expect(pendingResult.data.length).toBe(1);
      expect(pendingResult.data[0].status).toBe('pending');

      const multiStatusResult = await getSchedulingRequestsFiltered({ status: ['pending', 'booked'] });
      expect(multiStatusResult.data.length).toBe(2);
    });

    it('should filter by search term (email)', async () => {
      await createSchedulingRequest(createMockRequest({ candidateEmail: 'john@example.com' }));
      await createSchedulingRequest(createMockRequest({ candidateEmail: 'jane@example.com' }));
      await createSchedulingRequest(createMockRequest({ candidateEmail: 'bob@test.com' }));

      const result = await getSchedulingRequestsFiltered({ search: 'example.com' });
      expect(result.data.length).toBe(2);
    });

    it('should filter by search term (application ID)', async () => {
      await createSchedulingRequest(createMockRequest({ applicationId: 'APP-12345' }));
      await createSchedulingRequest(createMockRequest({ applicationId: 'APP-67890' }));

      const result = await getSchedulingRequestsFiltered({ search: '12345' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].applicationId).toBe('APP-12345');
    });

    it('should filter by age range', async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // Today
      await createSchedulingRequest(createMockRequest({ createdAt: new Date(now) }));
      // 5 days ago
      await createSchedulingRequest(createMockRequest({ createdAt: new Date(now - 5 * dayMs) }));
      // 10 days ago
      await createSchedulingRequest(createMockRequest({ createdAt: new Date(now - 10 * dayMs) }));
      // 20 days ago
      await createSchedulingRequest(createMockRequest({ createdAt: new Date(now - 20 * dayMs) }));

      const recentResult = await getSchedulingRequestsFiltered({ ageRange: '0-2d' });
      expect(recentResult.data.length).toBe(1);

      const midResult = await getSchedulingRequestsFiltered({ ageRange: '3-7d' });
      expect(midResult.data.length).toBe(1);

      const oldResult = await getSchedulingRequestsFiltered({ ageRange: '15+d' });
      expect(oldResult.data.length).toBe(1);
    });

    it('should filter by interviewer email', async () => {
      await createSchedulingRequest(createMockRequest({ interviewerEmails: ['alice@company.com'] }));
      await createSchedulingRequest(createMockRequest({ interviewerEmails: ['bob@company.com'] }));
      await createSchedulingRequest(createMockRequest({ interviewerEmails: ['alice@company.com', 'bob@company.com'] }));

      const result = await getSchedulingRequestsFiltered({ interviewerEmail: 'alice@company.com' });
      expect(result.data.length).toBe(2);
    });

    it('should paginate results', async () => {
      // Create 25 requests
      for (let i = 0; i < 25; i++) {
        await createSchedulingRequest(createMockRequest());
      }

      const page1 = await getSchedulingRequestsFiltered({}, { page: 1, limit: 10 });
      expect(page1.data.length).toBe(10);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(10);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);

      const page2 = await getSchedulingRequestsFiltered({}, { page: 2, limit: 10 });
      expect(page2.data.length).toBe(10);
      expect(page2.page).toBe(2);

      const page3 = await getSchedulingRequestsFiltered({}, { page: 3, limit: 10 });
      expect(page3.data.length).toBe(5);
    });

    it('should sort by status (pending first, then oldest)', async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      await createSchedulingRequest(createMockRequest({
        status: 'booked',
        createdAt: new Date(now)
      }));
      await createSchedulingRequest(createMockRequest({
        status: 'pending',
        createdAt: new Date(now - 2 * dayMs)
      }));
      await createSchedulingRequest(createMockRequest({
        status: 'pending',
        createdAt: new Date(now)
      }));

      const result = await getSchedulingRequestsFiltered({}, { sortBy: 'status', sortOrder: 'asc' });

      // First two should be pending
      expect(result.data[0].status).toBe('pending');
      expect(result.data[1].status).toBe('pending');
      // First pending should be older
      expect(new Date(result.data[0].createdAt).getTime()).toBeLessThan(
        new Date(result.data[1].createdAt).getTime()
      );
      // Last should be booked
      expect(result.data[2].status).toBe('booked');
    });
  });

  describe('getSchedulingRequestCounts', () => {
    it('should return counts by status', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'pending' }));
      await createSchedulingRequest(createMockRequest({ status: 'pending' }));
      await createSchedulingRequest(createMockRequest({ status: 'booked' }));
      await createSchedulingRequest(createMockRequest({ status: 'cancelled' }));

      const counts = await getSchedulingRequestCounts();
      expect(counts.all).toBe(4);
      expect(counts.pending).toBe(2);
      expect(counts.booked).toBe(1);
      expect(counts.cancelled).toBe(1);
      expect(counts.rescheduled).toBe(0);
    });

    it('should return zeros when no requests exist', async () => {
      const counts = await getSchedulingRequestCounts();
      expect(counts.all).toBe(0);
      expect(counts.pending).toBe(0);
      expect(counts.booked).toBe(0);
    });
  });
});

describe('Coordinator API - Sync Job Filtering', () => {
  beforeEach(() => {
    resetDatabase();
  });

  function createMockSyncJob(overrides: Partial<SyncJob> = {}): SyncJob {
    return {
      id: uuidv4(),
      type: 'icims_writeback',
      entityType: 'scheduling_request',
      entityId: uuidv4(),
      payload: {},
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      runAfter: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('should filter requests with sync issues when needsSync=true', async () => {
    const request1 = {
      id: uuidv4(),
      applicationId: 'APP-1',
      candidateName: 'Test 1',
      candidateEmail: 'test1@example.com',
      reqTitle: 'Engineer',
      interviewType: 'phone_screen' as const,
      durationMinutes: 60,
      interviewerEmails: ['int@company.com'],
      organizerEmail: 'org@company.com',
      status: 'pending' as const,
      publicToken: uuidv4(),
      publicTokenHash: 'hash1',
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      candidateTimezone: 'America/New_York',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const request2 = {
      ...request1,
      id: uuidv4(),
      applicationId: 'APP-2',
      candidateEmail: 'test2@example.com',
      publicToken: uuidv4(),
      publicTokenHash: 'hash2',
    };

    await createSchedulingRequest(request1);
    await createSchedulingRequest(request2);

    // Create failed sync job for request1
    await createSyncJob(createMockSyncJob({
      entityId: request1.id,
      status: 'failed',
    }));

    const result = await getSchedulingRequestsFiltered({ needsSync: true });
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe(request1.id);
  });
});
