/**
 * StatusBadge - Unified status chip component
 *
 * Standardizes status display across the application with consistent
 * colors, sizing, and styling.
 */

import React from 'react';

export type StatusType =
  | 'pending'
  | 'submitted'
  | 'booked'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'processing'
  | 'completed'
  | 'active'
  | 'inactive'
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'unknown';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface StatusBadgeProps {
  status: StatusType | string;
  size?: BadgeSize;
  className?: string;
  showDot?: boolean;
}

const STATUS_COLORS: Record<StatusType, string> = {
  // Request/booking statuses
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  booked: 'bg-green-100 text-green-800 border-green-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',

  // Job/process statuses
  failed: 'bg-red-100 text-red-800 border-red-200',
  processing: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',

  // Connection statuses
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',

  // Health statuses
  healthy: 'bg-green-100 text-green-800 border-green-200',
  degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

const DOT_COLORS: Record<StatusType, string> = {
  pending: 'bg-yellow-500',
  submitted: 'bg-blue-500',
  booked: 'bg-green-500',
  confirmed: 'bg-green-500',
  cancelled: 'bg-red-500',
  expired: 'bg-gray-400',
  failed: 'bg-red-500',
  processing: 'bg-blue-500',
  completed: 'bg-green-500',
  active: 'bg-green-500',
  inactive: 'bg-gray-400',
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  critical: 'bg-red-500',
  unknown: 'bg-gray-400',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

const DOT_SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export function StatusBadge({
  status,
  size = 'md',
  className = '',
  showDot = false,
}: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  const colorClass = STATUS_COLORS[normalizedStatus] || STATUS_COLORS.unknown;
  const dotColor = DOT_COLORS[normalizedStatus] || DOT_COLORS.unknown;
  const sizeClass = SIZE_CLASSES[size];
  const dotSizeClass = DOT_SIZE_CLASSES[size];

  // Capitalize first letter for display
  const displayStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${colorClass} ${sizeClass} ${className}`}
    >
      {showDot && <span className={`rounded-full ${dotColor} ${dotSizeClass}`} />}
      {displayStatus}
    </span>
  );
}

export default StatusBadge;
