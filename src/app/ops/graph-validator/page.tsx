'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ValidationCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'pending';
  durationMs?: number;
  details?: string[];
  error?: string;
}

interface ValidationResult {
  overallStatus: 'ready' | 'not_ready' | 'not_configured';
  checks: ValidationCheck[];
  timestamp: string;
}

interface ConfigStatus {
  configured: boolean;
  mode: string;
}

export default function GraphValidatorPage() {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopingTestEmail, setScopingTestEmail] = useState('');
  const [runDryRun, setRunDryRun] = useState(false);

  // Fetch config status on load
  useEffect(() => {
    fetch('/api/ops/graph-validator')
      .then(res => res.json())
      .then(data => setConfigStatus(data))
      .catch(err => setError(err.message));
  }, []);

  const runValidation = async () => {
    setRunning(true);
    setError(null);
    setValidationResult(null);

    try {
      const res = await fetch('/api/ops/graph-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopingTestEmail: scopingTestEmail || undefined,
          runDryRun,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setValidationResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300">PASS</span>;
      case 'fail':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300">FAIL</span>;
      case 'skip':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-300">SKIP</span>;
      case 'pending':
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300">PENDING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600 text-slate-300">{status}</span>;
    }
  };

  const getOverallStatusBanner = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <div className="px-4 py-3 bg-emerald-900/50 border border-emerald-700 rounded-lg text-emerald-300 text-center font-medium">
            READY FOR PRODUCTION
          </div>
        );
      case 'not_ready':
        return (
          <div className="px-4 py-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-center font-medium">
            NOT READY - Fix failed checks
          </div>
        );
      case 'not_configured':
        return (
          <div className="px-4 py-3 bg-amber-900/50 border border-amber-700 rounded-lg text-amber-300 text-center font-medium">
            NOT CONFIGURED - Set GRAPH_MODE=real and configure environment variables
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ops" className="text-slate-400 hover:text-slate-200">
              &larr; Ops Dashboard
            </Link>
            <h1 className="text-xl font-semibold">Graph API Validator</h1>
          </div>
          {configStatus && (
            <span className={`text-sm ${configStatus.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
              Mode: {configStatus.mode}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded text-red-300">
            {error}
          </div>
        )}

        {/* Configuration Section */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Validation Options</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Scoping Test Email (optional)
              </label>
              <input
                type="email"
                value={scopingTestEmail}
                onChange={(e) => setScopingTestEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter an email address that should be DENIED access to verify Application Access Policy is working.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="runDryRun"
                checked={runDryRun}
                onChange={(e) => setRunDryRun(e.target.checked)}
                className="rounded bg-slate-700 border-slate-600"
              />
              <label htmlFor="runDryRun" className="text-sm text-slate-300">
                Run Event Lifecycle Test (creates and deletes a test event)
              </label>
            </div>

            <button
              onClick={runValidation}
              disabled={running}
              className={`px-6 py-2 rounded font-medium transition-colors ${
                running
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Running Validation...
                </span>
              ) : (
                'Run Validation'
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {validationResult && (
          <div className="space-y-6">
            {/* Overall Status */}
            {getOverallStatusBanner(validationResult.overallStatus)}

            {/* Checks List */}
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="font-medium">Validation Checks</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Last run: {new Date(validationResult.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="divide-y divide-slate-700">
                {validationResult.checks.map((check, index) => (
                  <div key={index} className="px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(check.status)}
                        <span className="font-medium">{check.name}</span>
                      </div>
                      {check.durationMs !== undefined && (
                        <span className="text-xs text-slate-500">{check.durationMs}ms</span>
                      )}
                    </div>
                    {check.details && (
                      <ul className="ml-6 text-sm text-slate-400 space-y-1">
                        {check.details.map((detail, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-slate-600">-</span>
                            <span className="font-mono text-xs">{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {check.error && (
                      <div className="ml-6 mt-2 p-2 bg-red-900/30 rounded text-xs text-red-300 font-mono whitespace-pre-wrap">
                        {check.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-slate-800/50 rounded-lg p-6 mt-6">
          <h3 className="font-medium mb-3">About Graph Validation</h3>
          <div className="text-sm text-slate-400 space-y-2">
            <p>
              This validator checks your Microsoft Graph API configuration and connectivity.
              It verifies that:
            </p>
            <ul className="list-disc ml-4 space-y-1">
              <li>Required environment variables are set correctly</li>
              <li>OAuth token acquisition works</li>
              <li>The organizer calendar is accessible</li>
              <li>Application Access Policy restricts access (optional)</li>
              <li>FreeBusy queries work</li>
              <li>Event creation/deletion works (optional)</li>
            </ul>
            <p className="mt-4 text-amber-400">
              Run <code className="bg-slate-700 px-1 rounded">npm run graph:smoke</code> from the command line for a more detailed test.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
