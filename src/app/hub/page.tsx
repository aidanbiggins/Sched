'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  CATEGORY_INFO,
  getCategorizedFeatures,
  searchFeatures,
  type Feature,
  type FeatureCategory,
  type UserRole,
} from '@/lib/featureRegistry';
import { getRecentVisits, formatTimeAgo, type RecentVisit } from '@/lib/recentVisits';
import { StatusBadge, LoadingSpinner, ConfirmModal } from '@/components/ui';
import { OrgSwitcher } from '@/components/OrgSwitcher';
import type { EnvStatus } from '@/app/api/ops/status/route';

// ============================================
// Types
// ============================================

type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

interface HealthData {
  status: HealthStatus;
  webhooks?: { last24h: { failed: number } };
  reconciliation?: { failed: number; requiresAttention: number };
  requests?: { needsAttention: number };
}

// ============================================
// Helper Components
// ============================================

function FeatureCard({ feature }: { feature: Feature }) {
  // Don't render cards for dynamic routes as standalone links
  if (feature.route.includes('[') && !feature.route.includes('demo')) {
    return null;
  }

  return (
    <Link
      href={feature.route}
      className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{feature.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
            {feature.name}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{feature.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {feature.dependencies.slice(0, 3).map((dep) => (
              <span
                key={dep}
                className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

function CategorySection({
  category,
  features,
}: {
  category: FeatureCategory;
  features: Feature[];
}) {
  const info = CATEGORY_INFO[category];
  // Filter out features with dynamic routes (except demo)
  const visibleFeatures = features.filter(
    (f) => !f.route.includes('[') || f.route.includes('demo')
  );

  if (visibleFeatures.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{info.icon}</span>
        <h2 className="text-lg font-semibold text-gray-900">{info.name}</h2>
        <span className="text-sm text-gray-500">({visibleFeatures.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleFeatures.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </div>
  );
}

function RecentVisitsSection({ visits }: { visits: RecentVisit[] }) {
  if (visits.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
        <span>🕐</span> Recently Visited
      </h3>
      <div className="flex flex-wrap gap-2">
        {visits.map((visit) => (
          <Link
            key={visit.route}
            href={visit.route}
            className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-2"
          >
            <span>{visit.title}</span>
            <span className="text-gray-400 text-xs">{formatTimeAgo(visit.timestamp)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function EnvStatusPanel({
  status,
  health,
}: {
  status: EnvStatus | null;
  health: HealthData | null;
}) {
  if (!status) return null;

  const getStatusIndicator = (isConfigured: boolean, mode?: string) => {
    if (!isConfigured) return <span className="w-2 h-2 rounded-full bg-gray-300" />;
    if (mode === 'mock') return <span className="w-2 h-2 rounded-full bg-yellow-400" />;
    if (mode === 'live') return <span className="w-2 h-2 rounded-full bg-green-400" />;
    return <span className="w-2 h-2 rounded-full bg-blue-400" />;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <span>🔧</span> Environment Status
        </h3>
        {health && <StatusBadge status={health.status} size="sm" showDot />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="flex items-center gap-2">
          {getStatusIndicator(status.graph.configured, status.graph.mode)}
          <span className="text-gray-600">Graph:</span>
          <span className="text-gray-900 font-medium">{status.graph.mode}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIndicator(status.icims.configured, status.icims.mode)}
          <span className="text-gray-600">iCIMS:</span>
          <span className="text-gray-900 font-medium">{status.icims.mode}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIndicator(true, status.email.mode)}
          <span className="text-gray-600">Email:</span>
          <span className="text-gray-900 font-medium">{status.email.mode}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIndicator(status.database.configured)}
          <span className="text-gray-600">DB:</span>
          <span className="text-gray-900 font-medium">{status.database.type}</span>
        </div>
      </div>
      {status.environment !== 'production' && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">
            {status.environment.toUpperCase()} MODE
          </span>
        </div>
      )}
    </div>
  );
}

function ChecksSection({
  envStatus,
  health,
}: {
  envStatus: EnvStatus | null;
  health: HealthData | null;
}) {
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Only show in non-production
  if (envStatus?.environment === 'production') return null;

  const runAction = async (action: string, endpoint: string, method: string = 'POST') => {
    setActionLoading(action);
    setActionResult(null);

    try {
      const res = await fetch(endpoint, { method });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Action failed');
      }

      setActionResult({ type: 'success', message: data.message || 'Action completed' });
    } catch (err) {
      setActionResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Action failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSeedData = async () => {
    setShowSeedConfirm(false);
    await runAction('seed', '/api/ops/seed');
  };

  const handleRunReconcile = async () => {
    setShowReconcileConfirm(false);
    await runAction('reconcile', '/api/ops/reconciliation/run');
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
        <span>✅</span> Quick Actions
        <span className="text-xs text-gray-500 font-normal">(Dev Only)</span>
      </h3>

      {actionResult && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            actionResult.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {actionResult.message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowSeedConfirm(true)}
          disabled={actionLoading !== null}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === 'seed' && <LoadingSpinner size="sm" color="gray" />}
          🌱 Seed Demo Data
        </button>
        <button
          onClick={() => setShowReconcileConfirm(true)}
          disabled={actionLoading !== null}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === 'reconcile' && <LoadingSpinner size="sm" color="gray" />}
          🔄 Run Reconciliation
        </button>
        <Link
          href="/ops"
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          📊 View Ops Dashboard
        </Link>
      </div>

      {health && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Failed Webhooks:</span>
              <span className="ml-2 font-medium">
                {health.webhooks?.last24h?.failed ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Failed Jobs:</span>
              <span className="ml-2 font-medium">
                {health.reconciliation?.failed ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Needs Attention:</span>
              <span className="ml-2 font-medium">
                {health.requests?.needsAttention ?? 0}
              </span>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showSeedConfirm}
        onClose={() => setShowSeedConfirm(false)}
        onConfirm={handleSeedData}
        title="Seed Demo Data"
        message="This will create sample scheduling requests for testing. Continue?"
        confirmLabel="Seed Data"
        variant="info"
        loading={actionLoading === 'seed'}
      />

      <ConfirmModal
        isOpen={showReconcileConfirm}
        onClose={() => setShowReconcileConfirm(false)}
        onConfirm={handleRunReconcile}
        title="Run Reconciliation"
        message="This will process pending reconciliation jobs. Continue?"
        confirmLabel="Run"
        variant="info"
        loading={actionLoading === 'reconcile'}
      />
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function HubPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [searchQuery, setSearchQuery] = useState('');
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);

  // Determine user role based on session
  const isSuperadmin = session?.user?.isSuperadmin || false;
  const activeOrgRole = session?.user?.activeOrgRole;
  const userRole: UserRole = isSuperadmin ? 'superadmin' : (activeOrgRole === 'admin' ? 'admin' : 'coordinator');
  const isAdmin = isSuperadmin; // Only superadmins see ops/quick actions

  // Load data
  useEffect(() => {
    // Load recent visits
    setRecentVisits(getRecentVisits());

    // Load env status (superadmin only)
    fetch('/api/ops/status')
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => data && setEnvStatus(data))
      .catch(() => {});

    // Load health (superadmin only)
    fetch('/api/ops/health')
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => data && setHealth(data))
      .catch(() => {});
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/signin');
    }
  }, [sessionStatus, router]);

  // Get features based on search or categorized
  const getDisplayFeatures = useCallback(() => {
    if (searchQuery) {
      return searchFeatures(searchQuery, userRole);
    }
    return null; // Will show categorized view
  }, [searchQuery, userRole]);

  const searchResults = getDisplayFeatures();
  const categorizedFeatures = getCategorizedFeatures(userRole);

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏠</span>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Sched Hub</h1>
                <p className="text-sm text-gray-500">Central navigation and status</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <OrgSwitcher />
              {session?.user?.name && (
                <span className="text-sm text-gray-600">
                  Welcome, {session.user.name.split(' ')[0]}
                  {isSuperadmin && (
                    <span className="ml-1 text-xs text-purple-600">(Superadmin)</span>
                  )}
                </span>
              )}
              <Link
                href="/settings"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search features, pages, routes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Environment Status */}
        <EnvStatusPanel status={envStatus} health={health} />

        {/* Recent Visits */}
        <RecentVisitsSection visits={recentVisits} />

        {/* Quick Actions (Admin/Dev) */}
        {isAdmin && <ChecksSection envStatus={envStatus} health={health} />}

        {/* Search Results or Categories */}
        {searchResults ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Search Results ({searchResults.length})
            </h2>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No features found matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Quick Links */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/coordinator"
                  className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <span className="text-3xl">📊</span>
                  <div>
                    <h3 className="font-medium text-indigo-900">Coordinator Dashboard</h3>
                    <p className="text-sm text-indigo-600">Manage scheduling requests</p>
                  </div>
                </Link>
                <Link
                  href="/coordinator/availability"
                  className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <span className="text-3xl">📅</span>
                  <div>
                    <h3 className="font-medium text-blue-900">Availability Dashboard</h3>
                    <p className="text-sm text-blue-600">Candidate availability mode</p>
                  </div>
                </Link>
                <Link
                  href="/demo"
                  className="flex items-center gap-4 p-4 bg-green-50 border border-green-100 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <span className="text-3xl">🎮</span>
                  <div>
                    <h3 className="font-medium text-green-900">Demo Mode</h3>
                    <p className="text-sm text-green-600">Try the scheduling flow</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Feature Categories */}
            <CategorySection category="coordinator" features={categorizedFeatures.coordinator} />
            <CategorySection category="operations" features={categorizedFeatures.operations} />
            <CategorySection category="demo" features={categorizedFeatures.demo} />
            <CategorySection category="settings" features={categorizedFeatures.settings} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between text-sm text-gray-500">
          <div>
            <Link href="/docs/plans/PRODUCT_AUDIT_AND_NAV_HUB.md" className="hover:text-gray-700">
              Documentation
            </Link>
          </div>
          <div>Sched Interview Scheduler</div>
        </div>
      </footer>
    </div>
  );
}
