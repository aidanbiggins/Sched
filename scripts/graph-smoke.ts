/**
 * Graph API Smoke Test Script
 *
 * Validates Microsoft Graph API integration in a real Azure AD tenant.
 * Run with: npm run graph:smoke
 *
 * Environment Variables Required:
 * - GRAPH_MODE=real
 * - GRAPH_TENANT_ID
 * - GRAPH_CLIENT_ID
 * - GRAPH_CLIENT_SECRET
 * - GRAPH_ORGANIZER_EMAIL
 *
 * Optional:
 * - GRAPH_SCOPING_TEST_EMAIL - email to test that scoping is enforced (should be DENIED)
 */

import { validateGraphConfig, isGraphModeReal, GraphConfigError } from '../src/lib/graph/validateConfig';
import { GraphTokenManager } from '../src/lib/graph/GraphTokenManager';
import { graphFetch, GraphApiError } from '../src/lib/graph/graphRetry';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  details?: string[];
  error?: string;
}

interface SmokeTestSummary {
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

// Test helpers
function formatDuration(ms: number): string {
  return `${ms}ms`;
}

function printResult(index: number, total: number, result: TestResult): void {
  const status = result.status === 'pass' ? '\x1b[32mPASS\x1b[0m' :
                 result.status === 'fail' ? '\x1b[31mFAIL\x1b[0m' :
                 '\x1b[33mSKIP\x1b[0m';

  const padding = '.'.repeat(Math.max(0, 40 - result.name.length));
  console.log(`[${index}/${total}] ${result.name}${padding} ${status} (${formatDuration(result.durationMs)})`);

  if (result.details) {
    result.details.forEach(d => console.log(`      - ${d}`));
  }

  if (result.error) {
    console.log(`      \x1b[31mError: ${result.error}\x1b[0m`);
  }
}

// Test 1: Config Present
async function testConfigPresent(): Promise<TestResult> {
  const start = Date.now();
  const details: string[] = [];

  try {
    if (!isGraphModeReal()) {
      return {
        name: 'Config Present',
        status: 'fail',
        durationMs: Date.now() - start,
        error: 'GRAPH_MODE is not set to "real"',
      };
    }

    const config = validateGraphConfig();
    details.push(`GRAPH_TENANT_ID: ****-****-****-****-${config.tenantId.slice(-4)}`);
    details.push(`GRAPH_CLIENT_ID: ****-****-****-****-${config.clientId.slice(-4)}`);
    details.push(`GRAPH_CLIENT_SECRET: ******* (set)`);
    details.push(`GRAPH_ORGANIZER_EMAIL: ${config.organizerEmail}`);

    return {
      name: 'Config Present',
      status: 'pass',
      durationMs: Date.now() - start,
      details,
    };
  } catch (error) {
    return {
      name: 'Config Present',
      status: 'fail',
      durationMs: Date.now() - start,
      error: error instanceof GraphConfigError ? error.message : String(error),
    };
  }
}

// Test 2: Token Acquisition
async function testTokenAcquisition(): Promise<TestResult> {
  const start = Date.now();

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = await tokenManager.getToken();
    const status = tokenManager.getTokenStatus();

    return {
      name: 'Token Acquisition',
      status: 'pass',
      durationMs: Date.now() - start,
      details: [
        `Token acquired successfully`,
        `Expires: ${status.expiresAt?.toISOString() ?? 'unknown'}`,
      ],
    };
  } catch (error) {
    return {
      name: 'Token Acquisition',
      status: 'fail',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Test 3: Organizer Calendar Access
async function testOrganizerAccess(): Promise<TestResult> {
  const start = Date.now();

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = await tokenManager.getToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.organizerEmail)}/calendar`;

    const calendar = await graphFetch<{ id: string; name: string }>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      name: 'Organizer Calendar Access',
      status: 'pass',
      durationMs: Date.now() - start,
      details: [
        `GET /users/${config.organizerEmail}/calendar: 200 OK`,
        `Calendar ID: ${calendar.id.slice(0, 10)}...`,
      ],
    };
  } catch (error) {
    return {
      name: 'Organizer Calendar Access',
      status: 'fail',
      durationMs: Date.now() - start,
      error: error instanceof GraphApiError ? `${error.status}: ${error.message}` : String(error),
    };
  }
}

// Test 4: Scoping Enforced
async function testScopingEnforced(): Promise<TestResult> {
  const start = Date.now();
  const testEmail = process.env.GRAPH_SCOPING_TEST_EMAIL;

  if (!testEmail) {
    return {
      name: 'Scoping Enforced',
      status: 'skip',
      durationMs: Date.now() - start,
      details: ['GRAPH_SCOPING_TEST_EMAIL not set - skipping scoping test'],
    };
  }

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = await tokenManager.getToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(testEmail)}/calendar`;

    try {
      await graphFetch<{ id: string }>(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // If we get here, scoping is NOT enforced
      return {
        name: 'Scoping Enforced',
        status: 'fail',
        durationMs: Date.now() - start,
        error: `Access to ${testEmail} was ALLOWED - Application Access Policy may not be configured`,
      };
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 403) {
        return {
          name: 'Scoping Enforced',
          status: 'pass',
          durationMs: Date.now() - start,
          details: [
            `${testEmail} correctly denied`,
            'Application Access Policy is working',
          ],
        };
      }
      throw error;
    }
  } catch (error) {
    return {
      name: 'Scoping Enforced',
      status: 'fail',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Test 5: FreeBusy Query
async function testFreeBusy(): Promise<TestResult> {
  const start = Date.now();

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = await tokenManager.getToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.organizerEmail)}/calendar/getSchedule`;

    const now = new Date();
    const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    const response = await graphFetch<{
      value: Array<{
        scheduleId: string;
        availabilityView: string;
        scheduleItems: Array<{ start: { dateTime: string }; end: { dateTime: string }; status: string }>;
      }>;
    }>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schedules: [config.organizerEmail],
        startTime: {
          dateTime: now.toISOString(),
          timeZone: 'UTC',
        },
        endTime: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
        availabilityViewInterval: 60,
      }),
    });

    const busySlots = response.value[0]?.scheduleItems?.length ?? 0;

    return {
      name: 'FreeBusy Query',
      status: 'pass',
      durationMs: Date.now() - start,
      details: [
        `Retrieved schedule for organizer`,
        `${busySlots} busy slot(s) found`,
      ],
    };
  } catch (error) {
    return {
      name: 'FreeBusy Query',
      status: 'fail',
      durationMs: Date.now() - start,
      error: error instanceof GraphApiError ? `${error.status}: ${error.message}` : String(error),
    };
  }
}

// Test 6: Event Lifecycle (create, update, cancel)
async function testEventLifecycle(): Promise<TestResult> {
  const start = Date.now();
  const details: string[] = [];
  let eventId: string | null = null;

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = await tokenManager.getToken();
    const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.organizerEmail)}/calendar/events`;

    // Create event
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

    const createResponse = await graphFetch<{ id: string; subject: string }>(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Scheduler Smoke Test - Delete Me',
        body: {
          contentType: 'Text',
          content: 'This is a test event created by graph-smoke.ts. Safe to delete.',
        },
        start: {
          dateTime: startTime.toISOString().replace('Z', ''),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTime.toISOString().replace('Z', ''),
          timeZone: 'UTC',
        },
        showAs: 'free', // Don't block the calendar
      }),
    });

    eventId = createResponse.id;
    details.push(`Created event: ${eventId.slice(0, 20)}...`);

    // Update event
    const updateUrl = `${baseUrl}/${eventId}`;
    await graphFetch<{ id: string }>(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Scheduler Smoke Test - Updated',
      }),
    });
    details.push('Updated event subject');

    // Delete event (cleanup)
    await graphFetch<void>(updateUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    details.push('Deleted test event');
    eventId = null; // Mark as cleaned up

    return {
      name: 'Event Lifecycle',
      status: 'pass',
      durationMs: Date.now() - start,
      details,
    };
  } catch (error) {
    // Try to clean up if we created an event
    if (eventId) {
      try {
        const config = validateGraphConfig();
        const tokenManager = new GraphTokenManager({
          tenantId: config.tenantId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        });
        const token = await tokenManager.getToken();
        const deleteUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.organizerEmail)}/calendar/events/${eventId}`;
        await graphFetch<void>(deleteUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        details.push('Cleaned up test event after failure');
      } catch {
        details.push('Warning: Could not clean up test event');
      }
    }

    return {
      name: 'Event Lifecycle',
      status: 'fail',
      durationMs: Date.now() - start,
      details: details.length > 0 ? details : undefined,
      error: error instanceof GraphApiError ? `${error.status}: ${error.message}` : String(error),
    };
  }
}

// Main smoke test runner
async function runSmokeTests(): Promise<SmokeTestSummary> {
  console.log('\n\x1b[1mGraph API Smoke Tests\x1b[0m');
  console.log('=====================\n');

  const results: TestResult[] = [];

  // Run tests sequentially
  const tests = [
    testConfigPresent,
    testTokenAcquisition,
    testOrganizerAccess,
    testScopingEnforced,
    testFreeBusy,
    testEventLifecycle,
  ];

  for (let i = 0; i < tests.length; i++) {
    const result = await tests[i]();
    results.push(result);
    printResult(i + 1, tests.length, result);
  }

  const summary: SmokeTestSummary = {
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    skipped: results.filter(r => r.status === 'skip').length,
    results,
  };

  console.log('\n=====================');
  console.log(`RESULTS: ${summary.passed}/${tests.length} passed`);

  if (summary.failed > 0) {
    console.log(`\x1b[31mSTATUS: SMOKE TESTS FAILED\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mSTATUS: SMOKE TESTS PASSED\x1b[0m\n`);
  }

  return summary;
}

// Run the tests
runSmokeTests().catch((error) => {
  console.error('Unexpected error running smoke tests:', error);
  process.exit(1);
});
