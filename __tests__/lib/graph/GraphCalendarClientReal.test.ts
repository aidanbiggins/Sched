/**
 * Integration tests for GraphCalendarClientReal
 *
 * Tests the real Graph client with mocked HTTP responses.
 */

import { GraphCalendarClientReal } from '@/lib/graph/GraphCalendarClientReal';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GraphCalendarClientReal', () => {
  let client: GraphCalendarClientReal;

  const testConfig = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientSecret: 'test-secret-12345',
    organizerEmail: 'scheduling@test.com',
    tokenEndpoint: 'https://test.example.com/oauth2/token',
  };

  // Helper to mock token fetch
  const mockTokenFetch = () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token-123',
        expires_in: 3600,
      }),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new GraphCalendarClientReal(testConfig);
  });

  describe('getSchedule', () => {
    it('sends correct request and parses response', async () => {
      mockTokenFetch();

      // Mock Graph API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              scheduleId: 'user1@test.com',
              availabilityView: '000022220000',
              scheduleItems: [
                {
                  status: 'busy',
                  start: { dateTime: '2026-01-15T14:00:00', timeZone: 'UTC' },
                  end: { dateTime: '2026-01-15T15:00:00', timeZone: 'UTC' },
                  isPrivate: false,
                },
              ],
              workingHours: {
                startTime: '09:00:00.0000000',
                endTime: '17:00:00.0000000',
                timeZone: { name: 'America/New_York' },
                daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
              },
            },
          ],
        }),
      });

      const result = await client.getSchedule(
        ['user1@test.com'],
        new Date('2026-01-15T00:00:00Z'),
        new Date('2026-01-22T00:00:00Z'),
        30
      );

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('user1@test.com');
      expect(result[0].busyIntervals).toHaveLength(1);
      expect(result[0].busyIntervals[0].status).toBe('busy');
      expect(result[0].workingHours.start).toBe('09:00');
      expect(result[0].workingHours.end).toBe('17:00');
      expect(result[0].workingHours.daysOfWeek).toContain(1); // Monday

      // Verify request was made correctly
      const [graphUrl, graphOptions] = mockFetch.mock.calls[1];
      expect(graphUrl).toContain('/calendar/getSchedule');
      expect(graphOptions.method).toBe('POST');
      expect(graphOptions.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('handles schedule errors gracefully', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              scheduleId: 'user@test.com',
              availabilityView: '',
              scheduleItems: [],
              error: {
                message: 'Mailbox not found',
                responseCode: 'ErrorMailboxNotFound',
              },
            },
          ],
        }),
      });

      const result = await client.getSchedule(
        ['user@test.com'],
        new Date(),
        new Date(),
        30
      );

      // Should return empty availability on error
      expect(result[0].email).toBe('user@test.com');
      expect(result[0].busyIntervals).toHaveLength(0);
    });
  });

  describe('createEvent', () => {
    it('creates event and returns details', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'event-id-123',
          iCalUId: 'ical-uid-456',
          webLink: 'https://outlook.com/event/123',
          onlineMeeting: {
            joinUrl: 'https://teams.microsoft.com/meet/abc',
          },
        }),
      });

      const result = await client.createEvent('scheduling@test.com', {
        subject: 'Test Interview',
        body: { contentType: 'HTML', content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [
          { email: 'candidate@test.com', name: 'Candidate', type: 'required' },
        ],
        isOnlineMeeting: true,
        transactionId: 'tx-123',
      });

      expect(result.eventId).toBe('event-id-123');
      expect(result.iCalUId).toBe('ical-uid-456');
      expect(result.joinUrl).toBe('https://teams.microsoft.com/meet/abc');
      expect(result.webLink).toBe('https://outlook.com/event/123');
    });

    it('sends correct payload structure', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'event-id',
          iCalUId: 'ical-uid',
        }),
      });

      await client.createEvent('scheduling@test.com', {
        subject: 'Test Interview',
        body: { contentType: 'HTML', content: '<p>Body</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [
          { email: 'a@test.com', name: 'Attendee', type: 'required' },
        ],
        isOnlineMeeting: true,
        transactionId: 'tx-456',
      });

      const [, graphOptions] = mockFetch.mock.calls[1];
      const payload = JSON.parse(graphOptions.body);

      expect(payload.subject).toBe('Test Interview');
      expect(payload.body.contentType).toBe('HTML');
      expect(payload.start.dateTime).toContain('2026-01-15T14:00:00');
      expect(payload.start.timeZone).toBe('America/New_York');
      expect(payload.attendees[0].emailAddress.address).toBe('a@test.com');
      // Teams is disabled by default (GRAPH_ENABLE_TEAMS not set)
      expect(payload.isOnlineMeeting).toBe(false);
      expect(payload.onlineMeetingProvider).toBeUndefined();
      expect(payload.transactionId).toBe('tx-456');
    });

    it('enables Teams meeting when GRAPH_ENABLE_TEAMS=true', async () => {
      const originalEnv = process.env.GRAPH_ENABLE_TEAMS;
      process.env.GRAPH_ENABLE_TEAMS = 'true';

      try {
        mockTokenFetch();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'event-id',
            iCalUId: 'ical-uid',
            onlineMeeting: { joinUrl: 'https://teams.microsoft.com/meet/123' },
          }),
        });

        await client.createEvent('scheduling@test.com', {
          subject: 'Test Interview',
          body: { contentType: 'HTML', content: '<p>Body</p>' },
          start: new Date('2026-01-15T14:00:00Z'),
          end: new Date('2026-01-15T15:00:00Z'),
          timeZone: 'America/New_York',
          attendees: [],
          isOnlineMeeting: true,
          transactionId: 'tx-teams',
        });

        const [, graphOptions] = mockFetch.mock.calls[1];
        const payload = JSON.parse(graphOptions.body);

        expect(payload.isOnlineMeeting).toBe(true);
        expect(payload.onlineMeetingProvider).toBe('teamsForBusiness');
      } finally {
        process.env.GRAPH_ENABLE_TEAMS = originalEnv;
      }
    });
  });

  describe('updateEvent', () => {
    it('sends PATCH request with update payload', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await client.updateEvent('scheduling@test.com', 'event-123', {
        start: new Date('2026-01-16T14:00:00Z'),
        end: new Date('2026-01-16T15:00:00Z'),
        timeZone: 'America/New_York',
      });

      const [graphUrl, graphOptions] = mockFetch.mock.calls[1];
      expect(graphUrl).toContain('/events/event-123');
      expect(graphOptions.method).toBe('PATCH');

      const payload = JSON.parse(graphOptions.body);
      expect(payload.start.dateTime).toContain('2026-01-16T14:00:00');
    });

    it('only sends provided update fields', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await client.updateEvent('scheduling@test.com', 'event-123', {
        subject: 'New Subject',
      });

      const [, graphOptions] = mockFetch.mock.calls[1];
      const payload = JSON.parse(graphOptions.body);

      expect(payload.subject).toBe('New Subject');
      expect(payload.start).toBeUndefined();
      expect(payload.end).toBeUndefined();
    });
  });

  describe('cancelEvent', () => {
    it('sends POST /cancel request with comment', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202, // Accepted for cancel
      });

      await client.cancelEvent('scheduling@test.com', 'event-123', 'Position filled');

      const [graphUrl, graphOptions] = mockFetch.mock.calls[1];
      expect(graphUrl).toContain('/events/event-123/cancel');
      expect(graphOptions.method).toBe('POST');

      const payload = JSON.parse(graphOptions.body);
      expect(payload.comment).toBe('Position filled');
    });
  });

  describe('token management', () => {
    it('reuses cached token across requests', async () => {
      mockTokenFetch();

      // Multiple Graph API responses
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ value: [] }),
        });
      }

      // Make multiple requests
      await client.getSchedule(['a@test.com'], new Date(), new Date(), 30);
      await client.getSchedule(['b@test.com'], new Date(), new Date(), 30);
      await client.getSchedule(['c@test.com'], new Date(), new Date(), 30);

      // Should only have 1 token request + 3 Graph requests = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // First call should be token, rest should be Graph API
      const firstCallUrl = mockFetch.mock.calls[0][0];
      expect(firstCallUrl).toContain('oauth2/token');
    });
  });

  describe('getTokenStatus', () => {
    it('reports token status from manager', async () => {
      // Initially no token
      const statusBefore = client.getTokenStatus();
      expect(statusBefore.valid).toBe(false);

      // Fetch a token
      mockTokenFetch();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
      });
      await client.getSchedule(['a@test.com'], new Date(), new Date(), 30);

      // Now should have valid token
      const statusAfter = client.getTokenStatus();
      expect(statusAfter.valid).toBe(true);
      expect(statusAfter.expiresInSeconds).toBeGreaterThan(0);
    });
  });

  describe('getTokenMetrics', () => {
    it('reports metrics from token manager', async () => {
      mockTokenFetch();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
      });

      await client.getSchedule(['a@test.com'], new Date(), new Date(), 30);

      const metrics = client.getTokenMetrics();
      expect(metrics.tokenRefreshes).toBe(1);
      expect(metrics.tokenFailures).toBe(0);
    });
  });

  describe('error handling', () => {
    it('throws on Graph API error', async () => {
      mockTokenFetch();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Access denied' },
        }),
        headers: new Headers(),
      });

      await expect(
        client.getSchedule(['a@test.com'], new Date(), new Date(), 30)
      ).rejects.toThrow('Access denied');
    });

    it('throws on token acquisition failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      await expect(
        client.getSchedule(['a@test.com'], new Date(), new Date(), 30)
      ).rejects.toThrow('Token acquisition failed');
    });
  });
});
