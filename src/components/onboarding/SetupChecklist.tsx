/**
 * SetupChecklist - Getting started checklist for Hub page
 *
 * Shows incomplete setup tasks and guides users through first-time setup.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
  actionLabel: string;
}

export interface SetupChecklistProps {
  className?: string;
  onDismiss?: () => void;
}

export function SetupChecklist({ className = '', onDismiss }: SetupChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: 'organization',
      label: 'Create organization',
      description: 'Set up your team workspace',
      completed: false,
      href: '/onboarding',
      actionLabel: 'Create',
    },
    {
      id: 'calendar',
      label: 'Connect calendar',
      description: 'Link your Google or Microsoft calendar',
      completed: false,
      href: '/settings',
      actionLabel: 'Connect',
    },
    {
      id: 'request',
      label: 'Create first request',
      description: 'Schedule your first interview',
      completed: false,
      href: '/coordinator',
      actionLabel: 'Create',
    },
    {
      id: 'team',
      label: 'Invite team',
      description: 'Add colleagues to help with scheduling',
      completed: false,
      href: '/settings/team',
      actionLabel: 'Invite',
    },
  ]);

  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSetupStatus();
    // Check if dismissed
    const isDismissed = localStorage.getItem('setupChecklistDismissed');
    if (isDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  const checkSetupStatus = async () => {
    try {
      // Check organization
      const orgsRes = await fetch('/api/organizations');
      const orgsData = await orgsRes.json();
      const hasOrg = orgsData.organizations?.length > 0;

      // Check calendar connection
      const calRes = await fetch('/api/calendar/connections');
      const calData = await calRes.json();
      const hasCalendar = calData.connections?.some((c: { status: string }) => c.status === 'active');

      // Check scheduling requests
      const reqRes = await fetch('/api/scheduling-requests?limit=1');
      const reqData = await reqRes.json();
      const hasRequests = reqData.requests?.length > 0 || reqData.data?.length > 0;

      // Check team members (if has org)
      let hasTeam = false;
      if (hasOrg) {
        // API returns flat structure: { id, name, slug, role, joinedAt }
        const orgId = orgsData.organizations[0].id;
        const membersRes = await fetch(`/api/organizations/${orgId}/members`);
        const membersData = await membersRes.json();
        hasTeam = (membersData.members?.length || 0) > 1;
      }

      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          completed:
            item.id === 'organization' ? hasOrg :
            item.id === 'calendar' ? hasCalendar :
            item.id === 'request' ? hasRequests :
            item.id === 'team' ? hasTeam :
            item.completed,
        }))
      );
    } catch (error) {
      console.error('Failed to check setup status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('setupChecklistDismissed', 'true');
    setDismissed(true);
    onDismiss?.();
  };

  const completedCount = items.filter((i) => i.completed).length;
  const allComplete = completedCount === items.length;

  // Don't show if dismissed or all complete
  if (dismissed || allComplete) {
    return null;
  }

  if (loading) {
    return (
      <div className={`bg-white border border-gray-200 rounded-xl p-6 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Getting Started</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Complete these steps to set up your workspace
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Checklist */}
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <div
            key={item.id}
            className={`px-5 py-3 flex items-center justify-between ${
              item.completed ? 'bg-gray-50/50' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                  ${item.completed
                    ? 'bg-[#1a5f5f] text-white'
                    : 'border-2 border-gray-300'
                  }
                `}
              >
                {item.completed && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div>
                <span className={`text-sm font-medium ${item.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {item.label}
                </span>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
            {!item.completed && (
              <Link
                href={item.href}
                className="px-3 py-1.5 text-xs font-medium text-[#1a5f5f] hover:bg-[#1a5f5f]/10 rounded-lg transition-colors flex items-center gap-1"
              >
                {item.actionLabel}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1a5f5f] rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / items.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">
            {completedCount} of {items.length}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SetupChecklist;
