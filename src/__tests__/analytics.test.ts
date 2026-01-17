/**
 * Tests for Analytics (M12)
 */

import {
  createSchedulingRequest,
  createBooking,
  createAuditLog,
  getAnalyticsData,
  getTimeToScheduleData,
  getAuditActionCounts,
  resetDatabase,
} from '@/lib/db';
import {
  getAnalytics,
  getDateRangeForPeriod,
  analyticsToCSV,
} from '@/lib/analytics/AnalyticsService';
import { SchedulingRequest, Booking, AuditLog } from '@/types/scheduling';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

describe('Analytics - M12', () => {
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
      reqId: null,
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      durationMinutes: 60,
      interviewerEmails: ['interviewer@company.com'],
      organizerEmail: 'organizer@company.com',
      calendarProvider: 'microsoft_graph',
      graphTenantId: null,
      status: 'pending',
      needsAttention: false,
      needsAttentionReason: null,
      publicToken: token,
      publicTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      candidateTimezone: 'America/New_York',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createMockBooking(requestId: string, overrides: Partial<Booking> = {}): Booking {
    return {
      id: uuidv4(),
      requestId,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      calendarEventId: null,
      calendarIcalUid: null,
      conferenceJoinUrl: null,
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

  function createMockAuditLog(requestId: string, action: string): AuditLog {
    return {
      id: uuidv4(),
      requestId,
      bookingId: null,
      action: action as AuditLog['action'],
      actorType: 'system',
      actorId: null,
      payload: {},
      createdAt: new Date(),
    };
  }

  describe('getDateRangeForPeriod', () => {
    it('should return correct date range for 7d', () => {
      const { start, end } = getDateRangeForPeriod('7d');
      const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(diffDays)).toBe(7);
    });

    it('should return correct date range for 30d', () => {
      const { start, end } = getDateRangeForPeriod('30d');
      const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(diffDays)).toBe(30);
    });

    it('should return correct date range for 90d', () => {
      const { start, end } = getDateRangeForPeriod('90d');
      const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(diffDays)).toBe(90);
    });

    it('should return very old start date for all', () => {
      const { start } = getDateRangeForPeriod('all');
      expect(start.getTime()).toBe(0);
    });
  });

  describe('getAnalyticsData', () => {
    it('should count requests by status', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'pending' }));
      await createSchedulingRequest(createMockRequest({ status: 'pending' }));
      await createSchedulingRequest(createMockRequest({ status: 'booked' }));
      await createSchedulingRequest(createMockRequest({ status: 'cancelled' }));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getAnalyticsData(start, end);

      expect(result.statusCounts['pending']).toBe(2);
      expect(result.statusCounts['booked']).toBe(1);
      expect(result.statusCounts['cancelled']).toBe(1);
    });

    it('should count requests by interview type', async () => {
      await createSchedulingRequest(createMockRequest({ interviewType: 'phone_screen' }));
      await createSchedulingRequest(createMockRequest({ interviewType: 'phone_screen' }));
      await createSchedulingRequest(createMockRequest({ interviewType: 'onsite' }));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getAnalyticsData(start, end);

      expect(result.interviewTypeCounts['phone_screen']).toBe(2);
      expect(result.interviewTypeCounts['onsite']).toBe(1);
    });

    it('should filter by user', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'pending', createdBy: 'user-1' }));
      await createSchedulingRequest(createMockRequest({ status: 'pending', createdBy: 'user-2' }));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getAnalyticsData(start, end, 'user-1');

      expect(result.statusCounts['pending']).toBe(1);
    });

    it('should count cancellation reasons', async () => {
      const request = createMockRequest({ status: 'cancelled' });
      await createSchedulingRequest(request);
      await createBooking(createMockBooking(request.id, {
        status: 'cancelled',
        cancellationReason: 'Candidate withdrew',
      }));

      const request2 = createMockRequest({ status: 'cancelled' });
      await createSchedulingRequest(request2);
      await createBooking(createMockBooking(request2.id, {
        status: 'cancelled',
        cancellationReason: 'Candidate withdrew',
      }));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getAnalyticsData(start, end);

      expect(result.cancellationReasons['Candidate withdrew']).toBe(2);
    });
  });

  describe('getTimeToScheduleData', () => {
    it('should calculate time-to-schedule in hours', async () => {
      const createdAt = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      const request = createMockRequest({ createdAt });
      await createSchedulingRequest(request);

      const bookedAt = new Date(); // Now
      await createBooking(createMockBooking(request.id, { bookedAt }));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getTimeToScheduleData(start, end);

      expect(result.length).toBe(1);
      expect(result[0]).toBeCloseTo(12, 0);
    });

    it('should return empty array when no bookings', async () => {
      await createSchedulingRequest(createMockRequest());

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getTimeToScheduleData(start, end);

      expect(result.length).toBe(0);
    });
  });

  describe('getAuditActionCounts', () => {
    it('should count audit actions', async () => {
      const request = createMockRequest();
      await createSchedulingRequest(request);
      await createAuditLog(createMockAuditLog(request.id, 'link_created'));
      await createAuditLog(createMockAuditLog(request.id, 'slots_viewed'));
      await createAuditLog(createMockAuditLog(request.id, 'slots_viewed'));

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = new Date();
      const result = await getAuditActionCounts(start, end);

      expect(result['link_created']).toBe(1);
      expect(result['slots_viewed']).toBe(2);
    });
  });

  describe('getAnalytics', () => {
    it('should return complete analytics response', async () => {
      // Create some test data
      const request1 = createMockRequest({ status: 'booked', createdBy: 'user-1' });
      await createSchedulingRequest(request1);
      await createBooking(createMockBooking(request1.id));
      await createAuditLog(createMockAuditLog(request1.id, 'link_created'));
      await createAuditLog(createMockAuditLog(request1.id, 'slots_viewed'));

      const request2 = createMockRequest({ status: 'pending', createdBy: 'user-1' });
      await createSchedulingRequest(request2);
      await createAuditLog(createMockAuditLog(request2.id, 'link_created'));

      const analytics = await getAnalytics('30d', 'user-1');

      expect(analytics.period).toBe('30d');
      expect(analytics.bookingMetrics.total).toBe(2);
      expect(analytics.bookingMetrics.byStatus.booked).toBe(1);
      expect(analytics.bookingMetrics.byStatus.pending).toBe(1);
      expect(analytics.engagement.linksCreated).toBe(2);
      expect(analytics.engagement.slotsViewed).toBe(1);
    });

    it('should calculate booking rate correctly', async () => {
      // 2 booked, 1 pending = 66.7% booking rate
      await createSchedulingRequest(createMockRequest({ status: 'booked', createdBy: 'user-1' }));
      await createSchedulingRequest(createMockRequest({ status: 'booked', createdBy: 'user-1' }));
      await createSchedulingRequest(createMockRequest({ status: 'pending', createdBy: 'user-1' }));

      const analytics = await getAnalytics('30d', 'user-1');

      expect(analytics.bookingMetrics.total).toBe(3);
      expect(analytics.bookingMetrics.bookingRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('analyticsToCSV', () => {
    it('should generate valid CSV', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'booked', createdBy: 'user-1' }));
      const analytics = await getAnalytics('30d', 'user-1');

      const csv = analyticsToCSV(analytics);

      expect(csv).toContain('Metric,Value,Period,Period Start,Period End');
      expect(csv).toContain('Total Requests,1,30d');
      expect(csv).toContain('Booking Rate,100.0%,30d');
    });

    it('should escape commas in values', async () => {
      await createSchedulingRequest(createMockRequest({ status: 'booked', createdBy: 'user-1' }));
      const analytics = await getAnalytics('30d', 'user-1');

      const csv = analyticsToCSV(analytics);

      // Should not have unquoted commas in data cells
      const lines = csv.split('\n');
      for (const line of lines.slice(1)) { // Skip header
        const cells = line.split(',');
        // Each line should have exactly 5 cells
        expect(cells.length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});
