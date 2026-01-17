'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  LoopTemplateWithSessions,
  LoopSolveResult,
  LoopSolution,
  LoopCommitResult,
  ScheduledSession,
} from '@/types/loop';

// ============================================================================
// Types
// ============================================================================

interface LoopAutopilotProps {
  availabilityRequestId: string;
  candidateName: string;
  candidateTimezone: string;
  onCommitSuccess?: (result: LoopCommitResult) => void;
}

interface LastRunData {
  found: boolean;
  solveRun?: {
    id: string;
    status: string;
    solutionsCount: number;
    solveDurationMs: number | null;
    createdAt: string;
    result: LoopSolveResult | null;
    errorMessage: string | null;
  };
  committedBooking?: {
    id: string;
    status: string;
    chosenSolutionId: string;
    createdAt: string;
  } | null;
}

// ============================================================================
// LoopAutopilot Component
// ============================================================================

export default function LoopAutopilot({
  availabilityRequestId,
  candidateName,
  candidateTimezone,
  onCommitSuccess,
}: LoopAutopilotProps) {
  // State
  const [templates, setTemplates] = useState<LoopTemplateWithSessions[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [interviewerOverrides, setInterviewerOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [solving, setSolving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solveResult, setSolveResult] = useState<LoopSolveResult | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<LastRunData | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
    fetchLastRun();
  }, [availabilityRequestId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/loop-autopilot/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data.templates || []);
      if (data.templates?.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(data.templates[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchLastRun = async () => {
    try {
      const response = await fetch(
        `/api/loop-autopilot/last-run?availabilityRequestId=${availabilityRequestId}`
      );
      if (response.ok) {
        const data = await response.json();
        setLastRun(data);
        if (data.solveRun?.result) {
          setSolveResult(data.solveRun.result);
        }
      }
    } catch (err) {
      console.error('Failed to fetch last run:', err);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Handle interviewer override input
  const handleInterviewerOverride = useCallback(
    (sessionId: string, value: string) => {
      setInterviewerOverrides((prev) => ({ ...prev, [sessionId]: value }));
    },
    []
  );

  // Run solver
  const handleSolve = async () => {
    if (!selectedTemplate) return;

    setSolving(true);
    setError(null);
    setSolveResult(null);
    setSelectedSolutionId(null);

    try {
      // Build interviewer pool overrides
      const poolOverrides: Record<string, { emails: string[]; requiredCount: number }> = {};
      for (const session of selectedTemplate.sessions) {
        const overrideStr = interviewerOverrides[session.id];
        if (overrideStr?.trim()) {
          const emails = overrideStr
            .split(',')
            .map((e) => e.trim())
            .filter((e) => e.includes('@'));
          if (emails.length > 0) {
            poolOverrides[session.id] = {
              emails,
              requiredCount: session.interviewerPool.requiredCount,
            };
          }
        }
      }

      const response = await fetch('/api/loop-autopilot/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityRequestId,
          loopTemplateId: selectedTemplateId,
          candidateTimezone,
          interviewerPoolOverrides: Object.keys(poolOverrides).length > 0 ? poolOverrides : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Solve failed');
      }

      const data = await response.json();
      setSolveResult(data.result);

      if (data.result.solutions.length > 0) {
        setSelectedSolutionId(data.result.solutions[0].solutionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run solver');
    } finally {
      setSolving(false);
    }
  };

  // Commit selected solution
  const handleCommit = async () => {
    if (!solveResult || !selectedSolutionId) return;

    setCommitting(true);
    setError(null);

    try {
      const response = await fetch('/api/loop-autopilot/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solveId: solveResult.solveId,
          solutionId: selectedSolutionId,
          commitIdempotencyKey: `commit-${availabilityRequestId}-${Date.now()}`,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Commit failed');
      }

      const result: LoopCommitResult = await response.json();

      if (result.status === 'COMMITTED' || result.status === 'ALREADY_COMMITTED') {
        onCommitSuccess?.(result);
        fetchLastRun(); // Refresh last run data
      } else {
        throw new Error(result.errorMessage || 'Commit failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit solution');
    } finally {
      setCommitting(false);
    }
  };

  // Render
  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <div className="animate-pulse">Loading Loop Autopilot...</div>
      </div>
    );
  }

  // If already committed
  if (lastRun?.committedBooking?.status === 'COMMITTED') {
    return (
      <div className="p-4 border rounded-lg bg-green-50 border-green-200">
        <h3 className="text-lg font-semibold text-green-800 mb-2">Loop Booked</h3>
        <p className="text-green-700">
          Interview loop has been successfully booked via Loop Autopilot.
        </p>
        <p className="text-sm text-green-600 mt-1">
          Booking ID: {lastRun.committedBooking.id}
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>Loop Autopilot</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Beta</span>
        </h3>
        <p className="text-indigo-100 text-sm">
          Automatically schedule a multi-session interview loop for {candidateName}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Template selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Loop Template
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setSolveResult(null);
              setSelectedSolutionId(null);
            }}
            className="w-full border rounded-md p-2 text-sm"
            disabled={solving || committing}
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.sessions.length} sessions)
              </option>
            ))}
          </select>
        </div>

        {/* Session configuration */}
        {selectedTemplate && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Sessions</h4>
            {selectedTemplate.sessions.map((session, idx) => (
              <div key={session.id} className="p-3 bg-gray-50 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    {idx + 1}. {session.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {session.durationMinutes} min
                  </span>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Interviewers (comma-separated emails, or leave blank for default pool)
                  </label>
                  <input
                    type="text"
                    placeholder={
                      session.interviewerPool.emails.length > 0
                        ? session.interviewerPool.emails.join(', ')
                        : 'e.g., alice@company.com, bob@company.com'
                    }
                    value={interviewerOverrides[session.id] || ''}
                    onChange={(e) => handleInterviewerOverride(session.id, e.target.value)}
                    className="w-full border rounded p-1.5 text-sm"
                    disabled={solving || committing}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Solve button */}
        {selectedTemplate && !solveResult && (
          <button
            onClick={handleSolve}
            disabled={solving || !selectedTemplateId}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            {solving ? 'Finding Solutions...' : 'Find Solutions'}
          </button>
        )}

        {/* Solutions display */}
        {solveResult && (
          <SolutionsDisplay
            result={solveResult}
            selectedSolutionId={selectedSolutionId}
            onSelectSolution={setSelectedSolutionId}
            onCommit={handleCommit}
            committing={committing}
            onReSolve={() => {
              setSolveResult(null);
              setSelectedSolutionId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SolutionsDisplay Component
// ============================================================================

interface SolutionsDisplayProps {
  result: LoopSolveResult;
  selectedSolutionId: string | null;
  onSelectSolution: (id: string) => void;
  onCommit: () => void;
  committing: boolean;
  onReSolve: () => void;
}

function SolutionsDisplay({
  result,
  selectedSolutionId,
  onSelectSolution,
  onCommit,
  committing,
  onReSolve,
}: SolutionsDisplayProps) {
  if (result.status === 'UNSATISFIABLE' || result.solutions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h4 className="font-medium text-yellow-800 mb-2">No Valid Solutions Found</h4>
          <p className="text-sm text-yellow-700 mb-3">
            The solver could not find a valid schedule. Here are the constraints that prevented scheduling:
          </p>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {result.topConstraints.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.key.replace(/_/g, ' ')}</span>: {c.description}
              </li>
            ))}
          </ul>
          {result.recommendedActions.length > 0 && (
            <>
              <h5 className="font-medium text-yellow-800 mt-4 mb-2">Recommended Actions:</h5>
              <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                {result.recommendedActions.map((a, i) => (
                  <li key={i}>{a.description}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button
          onClick={onReSolve}
          className="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-green-600 font-medium">
          {result.solutions.length} solution{result.solutions.length !== 1 ? 's' : ''} found
        </span>
        <span className="text-gray-500">
          Solved in {result.metadata.solveDurationMs}ms
        </span>
      </div>

      {/* Solution cards */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {result.solutions.map((solution, idx) => (
          <SolutionCard
            key={solution.solutionId}
            solution={solution}
            index={idx}
            isSelected={selectedSolutionId === solution.solutionId}
            onSelect={() => onSelectSolution(solution.solutionId)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onReSolve}
          className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
          disabled={committing}
        >
          Re-Solve
        </button>
        <button
          onClick={onCommit}
          disabled={!selectedSolutionId || committing}
          className="flex-1 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
        >
          {committing ? 'Booking...' : 'Book Selected'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// SolutionCard Component
// ============================================================================

interface SolutionCardProps {
  solution: LoopSolution;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function SolutionCard({ solution, index, isSelected, onSelect }: SolutionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg overflow-hidden cursor-pointer transition-all ${
        isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      {/* Card header */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
          <div>
            <span className="font-medium text-sm">Option {index + 1}</span>
            {index === 0 && (
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                Recommended
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className={solution.isSingleDay ? 'text-green-600' : ''}>
            {solution.isSingleDay ? 'Single day' : `${solution.daysSpan} days`}
          </span>
          <span className="text-xs text-gray-400">Score: {solution.score}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded session details */}
      {expanded && (
        <div className="border-t px-3 py-2 bg-white">
          <p className="text-xs text-gray-500 mb-2">{solution.rationaleSummary}</p>
          <div className="space-y-2">
            {solution.sessions.map((session, idx) => (
              <SessionRow key={session.sessionId} session={session} index={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SessionRow Component
// ============================================================================

interface SessionRowProps {
  session: ScheduledSession;
  index: number;
}

function SessionRow({ session, index }: SessionRowProps) {
  return (
    <div className="flex items-center text-sm py-1 border-b border-gray-100 last:border-0">
      <span className="w-6 text-gray-400">{index + 1}.</span>
      <span className="flex-1 font-medium">{session.sessionName}</span>
      <span className="text-gray-600 mx-2">
        {session.displayStart} - {session.displayEnd}
      </span>
      <span className="text-xs text-gray-500 truncate max-w-32" title={session.interviewerEmail}>
        {session.interviewerEmail.split('@')[0]}
      </span>
    </div>
  );
}
