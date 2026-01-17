/**
 * API Route: /api/ops/graph-validator
 *
 * POST - Run Graph API validation checks
 *
 * Returns results of various validation checks:
 * - Config present
 * - Token acquisition
 * - Organizer calendar access
 * - Scoping enforcement (optional)
 * - FreeBusy query
 * - Event lifecycle (optional dry-run)
 *
 * Protected by superadmin check.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for all checks

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { validateGraphConfig, isGraphModeReal, GraphConfigError } from '@/lib/graph/validateConfig';
import { GraphTokenManager } from '@/lib/graph/GraphTokenManager';
import { graphFetch, GraphApiError } from '@/lib/graph/graphRetry';
import { setLastValidationEvidence, getLastValidationEvidence } from '@/lib/graph/validationEvidence';
import type { GraphValidationEvidence } from '@/types/scheduling';

// Superadmin check
function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const superadmins = (process.env.SUPERADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
  return superadmins.includes(email.toLowerCase());
}

export interface ValidationCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'pending';
  durationMs?: number;
  details?: string[];
  error?: string;
}

export interface ValidationResult {
  overallStatus: 'ready' | 'not_ready' | 'not_configured';
  checks: ValidationCheck[];
  timestamp: string;
}

// Mask sensitive values
function maskValue(value: string, showLast = 4): string {
  if (value.length <= showLast) return '*'.repeat(value.length);
  return '*'.repeat(value.length - showLast) + value.slice(-showLast);
}

// Check 1: Config Present
async function checkConfigPresent(): Promise<ValidationCheck> {
  const start = Date.now();
  const details: string[] = [];

  try {
    if (!isGraphModeReal()) {
      return {
        name: 'Config Present',
        status: 'skip',
        durationMs: Date.now() - start,
        details: ['GRAPH_MODE is not set to "real" - Graph API not configured'],
      };
    }

    const config = validateGraphConfig();
    details.push(`GRAPH_TENANT_ID: ${maskValue(config.tenantId)}`);
    details.push(`GRAPH_CLIENT_ID: ${maskValue(config.clientId)}`);
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

// Check 2: Token Acquisition
async function checkTokenAcquisition(): Promise<ValidationCheck> {
  const start = Date.now();

  try {
    const config = validateGraphConfig();
    const tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    await tokenManager.getToken();
    const status = tokenManager.getTokenStatus();

    return {
      name: 'Token Acquisition',
      status: 'pass',
      durationMs: Date.now() - start,
      details: [
        'Token acquired successfully',
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

// Check 3: Organizer Calendar Access
async function checkOrganizerAccess(): Promise<ValidationCheck> {
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
        `Calendar ID: ${calendar.id.slice(0, 15)}...`,
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

// Check 4: Scoping Enforced (optional)
async function checkScopingEnforced(testEmail?: string): Promise<ValidationCheck> {
  const start = Date.now();

  if (!testEmail) {
    return {
      name: 'Scoping Enforced',
      status: 'skip',
      durationMs: Date.now() - start,
      details: ['No test email provided - skipping scoping validation'],
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
            `${testEmail} correctly denied (403 Forbidden)`,
            'Application Access Policy is working correctly',
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

// Check 5: FreeBusy Query
async function checkFreeBusy(): Promise<ValidationCheck> {
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
    const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const response = await graphFetch<{
      value: Array<{
        scheduleId: string;
        scheduleItems: Array<{ status: string }>;
      }>;
    }>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schedules: [config.organizerEmail],
        startTime: { dateTime: now.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
        availabilityViewInterval: 60,
      }),
    });

    const busySlots = response.value[0]?.scheduleItems?.length ?? 0;

    return {
      name: 'FreeBusy Query',
      status: 'pass',
      durationMs: Date.now() - start,
      details: [
        'Schedule query successful',
        `${busySlots} busy slot(s) found in next 7 days`,
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

// Check 6: Event Lifecycle (dry-run)
async function checkEventLifecycle(runDryRun: boolean): Promise<ValidationCheck> {
  const start = Date.now();
  const details: string[] = [];

  if (!runDryRun) {
    return {
      name: 'Event Lifecycle (Dry Run)',
      status: 'skip',
      durationMs: Date.now() - start,
      details: ['Dry run not requested - skipping event creation test'],
    };
  }

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
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const createResponse = await graphFetch<{ id: string }>(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Scheduler Validation Test - Delete Me',
        body: { contentType: 'Text', content: 'Test event from Graph Validator. Safe to delete.' },
        start: { dateTime: startTime.toISOString().replace('Z', ''), timeZone: 'UTC' },
        end: { dateTime: endTime.toISOString().replace('Z', ''), timeZone: 'UTC' },
        showAs: 'free',
      }),
    });

    eventId = createResponse.id;
    details.push(`Created test event: ${eventId.slice(0, 20)}...`);

    // Delete event (cleanup)
    await graphFetch<void>(`${baseUrl}/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    details.push('Deleted test event successfully');
    eventId = null;

    return {
      name: 'Event Lifecycle (Dry Run)',
      status: 'pass',
      durationMs: Date.now() - start,
      details,
    };
  } catch (error) {
    // Try to clean up
    if (eventId) {
      try {
        const config = validateGraphConfig();
        const tokenManager = new GraphTokenManager({
          tenantId: config.tenantId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        });
        const token = await tokenManager.getToken();
        await graphFetch<void>(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.organizerEmail)}/calendar/events/${eventId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        details.push('Warning: Could not clean up test event');
      }
    }

    return {
      name: 'Event Lifecycle (Dry Run)',
      status: 'fail',
      durationMs: Date.now() - start,
      details: details.length > 0 ? details : undefined,
      error: error instanceof GraphApiError ? `${error.status}: ${error.message}` : String(error),
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ValidationResult | { error: string }>> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check superadmin
    if (!isSuperadmin(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body for optional params
    let scopingTestEmail: string | undefined;
    let runDryRun = false;

    try {
      const body = await request.json();
      scopingTestEmail = body.scopingTestEmail;
      runDryRun = body.runDryRun === true;
    } catch {
      // No body or invalid JSON - use defaults
    }

    const checks: ValidationCheck[] = [];

    // Check 1: Config
    const configCheck = await checkConfigPresent();
    checks.push(configCheck);

    // If config fails or is skipped, skip remaining checks
    if (configCheck.status !== 'pass') {
      return NextResponse.json({
        overallStatus: 'not_configured',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    // Check 2: Token
    const tokenCheck = await checkTokenAcquisition();
    checks.push(tokenCheck);

    if (tokenCheck.status !== 'pass') {
      return NextResponse.json({
        overallStatus: 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    // Check 3: Organizer Access
    const organizerCheck = await checkOrganizerAccess();
    checks.push(organizerCheck);

    // Check 4: Scoping (optional)
    const scopingCheck = await checkScopingEnforced(scopingTestEmail);
    checks.push(scopingCheck);

    // Check 5: FreeBusy
    checks.push(await checkFreeBusy());

    // Check 6: Event Lifecycle (optional)
    checks.push(await checkEventLifecycle(runDryRun));

    // Determine overall status
    const failures = checks.filter(c => c.status === 'fail').length;
    const overallStatus = failures > 0 ? 'not_ready' : 'ready';

    // Get config for evidence
    let tenantId = '(unknown)';
    try {
      const config = validateGraphConfig();
      tenantId = maskValue(config.tenantId, 4);
    } catch {
      // Ignore - config already checked
    }

    // Save validation evidence
    const evidence: GraphValidationEvidence = {
      id: `val-${Date.now()}`,
      organizationId: null,
      tenantId,
      runAt: new Date(),
      overallStatus,
      checks,
      scopingProof: {
        organizerAccessAllowed: organizerCheck.status === 'pass',
        nonOrganizerAccessDenied: scopingCheck.status === 'pass' ? true : scopingCheck.status === 'fail' ? false : null,
        testEmail: scopingTestEmail || null,
      },
      runBy: session.user.email,
    };
    setLastValidationEvidence(evidence);

    return NextResponse.json({
      overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      evidenceId: evidence.id,
    });
  } catch (error) {
    console.error('Error running Graph validation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET returns current config status and last validation evidence
export async function GET(): Promise<NextResponse<{
  configured: boolean;
  mode: string;
  lastValidation?: {
    id: string;
    runAt: string;
    overallStatus: string;
    tenantId: string;
    runBy: string;
    scopingProof: {
      organizerAccessAllowed: boolean;
      nonOrganizerAccessDenied: boolean | null;
    };
    passedChecks: number;
    failedChecks: number;
    skippedChecks: number;
  };
} | { error: string }>> {
  try {
    const mode = isGraphModeReal() ? 'real' : 'mock';
    let configured = false;

    if (mode === 'real') {
      try {
        validateGraphConfig();
        configured = true;
      } catch {
        configured = false;
      }
    }

    // Include last validation evidence if available
    const result: {
      configured: boolean;
      mode: string;
      lastValidation?: {
        id: string;
        runAt: string;
        overallStatus: string;
        tenantId: string;
        runBy: string;
        scopingProof: {
          organizerAccessAllowed: boolean;
          nonOrganizerAccessDenied: boolean | null;
        };
        passedChecks: number;
        failedChecks: number;
        skippedChecks: number;
      };
    } = { configured, mode };

    const evidence = getLastValidationEvidence();
    if (evidence) {
      result.lastValidation = {
        id: evidence.id,
        runAt: evidence.runAt.toISOString(),
        overallStatus: evidence.overallStatus,
        tenantId: evidence.tenantId,
        runBy: evidence.runBy,
        scopingProof: {
          organizerAccessAllowed: evidence.scopingProof.organizerAccessAllowed,
          nonOrganizerAccessDenied: evidence.scopingProof.nonOrganizerAccessDenied,
        },
        passedChecks: evidence.checks.filter(c => c.status === 'pass').length,
        failedChecks: evidence.checks.filter(c => c.status === 'fail').length,
        skippedChecks: evidence.checks.filter(c => c.status === 'skip').length,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
