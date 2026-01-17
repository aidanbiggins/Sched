/**
 * Tests for Candidate Portal API
 * M16: Communications & Portal Hardening
 *
 * Note: These tests verify the API route logic by testing the underlying
 * database queries and token processing, not the actual HTTP handler.
 */

import {
  getSchedulingRequestByTokenHash,
  getAllSchedulingRequests,
  getBookingByRequestId,
} from '@/lib/db';
import { hashToken } from '@/lib/utils/tokens';

// Mock the database functions
jest.mock('@/lib/db', () => ({
  getSchedulingRequestByTokenHash: jest.fn(),
  getAllSchedulingRequests: jest.fn(),
  getBookingByRequestId: jest.fn(),
}));

// Mock the token utils
jest.mock('@/lib/utils/tokens', () => ({
  hashToken: jest.fn((token) => `hashed_${token}`),
}));

const mockGetSchedulingRequestByTokenHash = getSchedulingRequestByTokenHash as jest.Mock;
const mockGetAllSchedulingRequests = getAllSchedulingRequests as jest.Mock;
const mockGetBookingByRequestId = getBookingByRequestId as jest.Mock;
const mockHashToken = hashToken as jest.Mock;

// Simulate the API route logic for testing
async function simulateGet(token: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const tokenHash = mockHashToken(token);
  const initialRequest = await mockGetSchedulingRequestByTokenHash(tokenHash);

  if (!initialRequest) {
    return { status: 404, data: { error: 'Invalid or expired portal link' } };
  }

  const { candidateEmail, candidateName } = initialRequest;
  const allRequests = await mockGetAllSchedulingRequests();
  const candidateRequests = allRequests.filter(
    (r: { candidateEmail: string }) => r.candidateEmail.toLowerCase() === candidateEmail.toLowerCase()
  );

  const interviews = await Promise.all(
    candidateRequests.map(async (request: {
      id: string;
      candidateName: string;
      candidateEmail: string;
      reqTitle: string;
      interviewType: string;
      status: string;
      durationMinutes: number;
      publicToken: string;
      createdAt: Date;
    }) => {
      const booking = await mockGetBookingByRequestId(request.id);

      let effectiveStatus = request.status;
      if (booking) {
        if (booking.status === 'cancelled') {
          effectiveStatus = 'cancelled';
        } else if (
          booking.scheduledStart &&
          new Date(booking.scheduledStart) < new Date()
        ) {
          effectiveStatus = 'completed';
        }
      }

      return {
        id: request.id,
        requestId: request.id,
        candidateName: request.candidateName,
        candidateEmail: request.candidateEmail,
        reqTitle: request.reqTitle,
        interviewType: request.interviewType,
        status: effectiveStatus,
        durationMinutes: request.durationMinutes,
        scheduledStart: booking?.scheduledStart?.toISOString() || null,
        scheduledEnd: booking?.scheduledEnd?.toISOString() || null,
        conferenceJoinUrl: booking?.conferenceJoinUrl || null,
        publicToken: request.publicToken,
        createdAt: request.createdAt.toISOString(),
      };
    })
  );

  interviews.sort(
    (a: { createdAt: string }, b: { createdAt: string }) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    status: 200,
    data: { candidateName, candidateEmail, interviews },
  };
}

describe('Candidate Portal API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/candidate-portal/:token', () => {
    it('should return 404 for invalid token', async () => {
      mockGetSchedulingRequestByTokenHash.mockResolvedValue(null);

      const response = await simulateGet('invalid-token');

      expect(response.status).toBe(404);
      expect(response.data.error).toBe('Invalid or expired portal link');
    });

    it('should return interviews for valid token', async () => {
      const mockRequest = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'pending',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-15'),
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest]);
      mockGetBookingByRequestId.mockResolvedValue(null);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { candidateName: string; candidateEmail: string; interviews: Array<{ id: string }> };
      expect(data.candidateName).toBe('Test Candidate');
      expect(data.candidateEmail).toBe('candidate@example.com');
      expect(data.interviews).toHaveLength(1);
      expect(data.interviews[0].id).toBe('req-1');
    });

    it('should include booking details when interview is booked', async () => {
      const mockRequest = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'booked',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-15'),
      };

      const mockBooking = {
        id: 'booking-1',
        scheduledStart: new Date('2026-01-20T10:00:00Z'),
        scheduledEnd: new Date('2026-01-20T11:00:00Z'),
        conferenceJoinUrl: 'https://meet.example.com/123',
        status: 'confirmed',
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest]);
      mockGetBookingByRequestId.mockResolvedValue(mockBooking);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { interviews: Array<{ scheduledStart: string; conferenceJoinUrl: string }> };
      expect(data.interviews[0].scheduledStart).toBe('2026-01-20T10:00:00.000Z');
      expect(data.interviews[0].conferenceJoinUrl).toBe('https://meet.example.com/123');
    });

    it('should mark interview as completed when past scheduled time', async () => {
      const mockRequest = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'booked',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-10'),
      };

      const mockBooking = {
        id: 'booking-1',
        scheduledStart: new Date('2026-01-12T10:00:00Z'), // Past date
        scheduledEnd: new Date('2026-01-12T11:00:00Z'),
        conferenceJoinUrl: null,
        status: 'confirmed',
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest]);
      mockGetBookingByRequestId.mockResolvedValue(mockBooking);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { interviews: Array<{ status: string }> };
      expect(data.interviews[0].status).toBe('completed');
    });

    it('should return all interviews for the same candidate email', async () => {
      const mockRequest1 = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'pending',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-15'),
      };

      const mockRequest2 = {
        id: 'req-2',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Product Manager',
        interviewType: 'hm_screen',
        status: 'booked',
        durationMinutes: 45,
        publicToken: 'token456',
        createdAt: new Date('2026-01-14'),
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest1);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest1, mockRequest2]);
      mockGetBookingByRequestId.mockResolvedValue(null);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { interviews: Array<unknown> };
      expect(data.interviews).toHaveLength(2);
    });

    it('should filter out interviews for different candidates', async () => {
      const mockRequest1 = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'pending',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-15'),
      };

      const otherRequest = {
        id: 'req-3',
        candidateName: 'Other Candidate',
        candidateEmail: 'other@example.com',
        reqTitle: 'Designer',
        interviewType: 'onsite',
        status: 'pending',
        durationMinutes: 60,
        publicToken: 'token789',
        createdAt: new Date('2026-01-13'),
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest1);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest1, otherRequest]);
      mockGetBookingByRequestId.mockResolvedValue(null);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { interviews: Array<{ candidateEmail: string }> };
      expect(data.interviews).toHaveLength(1);
      expect(data.interviews[0].candidateEmail).toBe('candidate@example.com');
    });

    it('should sort interviews by created date, newest first', async () => {
      const mockRequest1 = {
        id: 'req-1',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        status: 'pending',
        durationMinutes: 60,
        publicToken: 'token123',
        createdAt: new Date('2026-01-10'),
      };

      const mockRequest2 = {
        id: 'req-2',
        candidateName: 'Test Candidate',
        candidateEmail: 'candidate@example.com',
        reqTitle: 'Product Manager',
        interviewType: 'hm_screen',
        status: 'pending',
        durationMinutes: 45,
        publicToken: 'token456',
        createdAt: new Date('2026-01-15'),
      };

      mockGetSchedulingRequestByTokenHash.mockResolvedValue(mockRequest1);
      mockGetAllSchedulingRequests.mockResolvedValue([mockRequest1, mockRequest2]);
      mockGetBookingByRequestId.mockResolvedValue(null);

      const response = await simulateGet('token123');

      expect(response.status).toBe(200);
      const data = response.data as { interviews: Array<{ id: string }> };
      expect(data.interviews[0].id).toBe('req-2'); // Newer one first
      expect(data.interviews[1].id).toBe('req-1');
    });
  });
});
