'use client';

/**
 * AvailabilityTimeGrid - A reusable week time-grid calendar component
 *
 * Features:
 * - Week view with time grid
 * - Drag to select availability blocks
 * - Click to remove blocks
 * - 15-minute snapping
 * - Timezone support
 * - Edit and readonly modes
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';

import {
  AvailabilityBlock,
  normalizeBlocks,
  generateBlockId,
  formatInTimezone,
} from '@/lib/scheduling/availabilityBlocks';

// Dynamically import FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import('@fullcalendar/react').then((mod) => mod.default),
  { ssr: false, loading: () => <CalendarSkeleton /> }
);

// These need to be imported normally since they're plugins
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';

// ============================================
// Types
// ============================================

export interface AvailabilityTimeGridProps {
  /** Edit mode allows adding/removing blocks, readonly just displays them */
  mode: 'edit' | 'readonly';

  /** The blocks to display */
  blocks: AvailabilityBlock[];

  /** Callback when blocks change (edit mode only) */
  onChange?: (blocks: AvailabilityBlock[]) => void;

  /** IANA timezone string (e.g., 'America/Los_Angeles') or 'local' */
  timezone?: string;

  /** Initial date to display (defaults to today) */
  initialDate?: Date;

  /** Earliest visible time (default '07:00:00') */
  minTime?: string;

  /** Latest visible time (default '21:00:00') */
  maxTime?: string;

  /** Slot duration in minutes (default 15) */
  slotDuration?: number;

  /** Whether to show week navigation buttons */
  showNavigation?: boolean;

  /** Header content (title, subtitle, etc.) */
  header?: React.ReactNode;

  /** Loading state */
  loading?: boolean;

  /** Error message to display */
  error?: string | null;

  /** Callback when error is dismissed */
  onDismissError?: () => void;

  /** Custom class name */
  className?: string;

  /** Constraint: earliest selectable date */
  validRangeStart?: Date;

  /** Constraint: latest selectable date */
  validRangeEnd?: Date;
}

// ============================================
// Helper Components
// ============================================

function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-12 bg-gray-200 rounded mb-4" />
      <div className="grid grid-cols-8 gap-1">
        <div className="h-8 bg-gray-100" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 mt-1">
        {Array.from({ length: 12 }).map((_, row) => (
          <React.Fragment key={row}>
            <div className="h-12 bg-gray-100 text-xs flex items-start justify-end pr-2 pt-1">
              {8 + row}:00
            </div>
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="h-12 bg-gray-50 border-t border-gray-100" />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Common Timezones
// ============================================

export const COMMON_TIMEZONES = [
  { value: 'local', label: 'Local Time' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'UTC', label: 'UTC' },
];

// ============================================
// Main Component
// ============================================

export function AvailabilityTimeGrid({
  mode,
  blocks,
  onChange,
  timezone = 'local',
  initialDate,
  minTime = '07:00:00',
  maxTime = '21:00:00',
  slotDuration = 15,
  showNavigation = true,
  header,
  loading = false,
  error = null,
  onDismissError,
  className = '',
  validRangeStart,
  validRangeEnd,
}: AvailabilityTimeGridProps) {
  const [currentDate, setCurrentDate] = useState<Date>(initialDate || new Date());
  const [calendarReady, setCalendarReady] = useState(false);
  // Key to force re-mount calendar when navigating
  const [calendarKey, setCalendarKey] = useState(0);

  // Handle calendar ready
  useEffect(() => {
    setCalendarReady(true);
  }, []);

  // Convert blocks to FullCalendar events
  const events: EventInput[] = useMemo(() => {
    return blocks.map((block) => {
      const start = new Date(block.startUtcIso);
      const end = new Date(block.endUtcIso);

      // Format time for display
      const startStr = formatInTimezone(start, timezone, {
        hour: 'numeric',
        minute: '2-digit',
      });
      const endStr = formatInTimezone(end, timezone, {
        hour: 'numeric',
        minute: '2-digit',
      });

      return {
        id: block.id,
        start: block.startUtcIso,
        end: block.endUtcIso,
        title: `${startStr} - ${endStr}`,
        backgroundColor: '#22c55e', // green-500
        borderColor: '#16a34a', // green-600
        textColor: '#ffffff',
        classNames: mode === 'edit' ? ['cursor-pointer', 'hover:opacity-80'] : [],
        extendedProps: {
          blockId: block.id,
        },
      };
    });
  }, [blocks, timezone, mode]);

  // Handle date selection (drag to create block)
  const handleSelect = useCallback(
    (selectInfo: DateSelectArg) => {
      if (mode !== 'edit' || !onChange) return;

      const newBlock: AvailabilityBlock = {
        id: generateBlockId(),
        startUtcIso: selectInfo.start.toISOString(),
        endUtcIso: selectInfo.end.toISOString(),
      };

      // Normalize blocks to merge adjacent and snap times
      const updatedBlocks = normalizeBlocks([...blocks, newBlock], {
        intervalMinutes: slotDuration,
        maxGapMinutes: 0,
      });

      onChange(updatedBlocks);

      // Clear the selection highlight
      selectInfo.view.calendar.unselect();
    },
    [mode, onChange, blocks, slotDuration]
  );

  // Handle event click (remove block)
  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      if (mode !== 'edit' || !onChange) return;

      const blockId = clickInfo.event.extendedProps.blockId;
      const updatedBlocks = blocks.filter((b) => b.id !== blockId);
      onChange(updatedBlocks);
    },
    [mode, onChange, blocks]
  );

  // Navigation handlers - use state-based navigation with key to force re-mount
  const goToPrev = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
    setCalendarKey(k => k + 1);
  }, []);

  const goToNext = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
    setCalendarKey(k => k + 1);
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
    setCalendarKey(k => k + 1);
  }, []);

  // Format the current week range for display
  const weekLabel = useMemo(() => {
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return `${formatInTimezone(weekStart, timezone, { month: 'short', day: 'numeric' })} - ${formatInTimezone(weekEnd, timezone, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [currentDate, timezone]);

  // Calculate valid range for selection
  const validRange = useMemo(() => {
    if (!validRangeStart && !validRangeEnd) return undefined;
    return {
      start: validRangeStart?.toISOString(),
      end: validRangeEnd?.toISOString(),
    };
  }, [validRangeStart, validRangeEnd]);

  // Total availability stats
  const stats = useMemo(() => {
    const totalMinutes = blocks.reduce((sum, block) => {
      const start = new Date(block.startUtcIso);
      const end = new Date(block.endUtcIso);
      return sum + (end.getTime() - start.getTime()) / (60 * 1000);
    }, 0);

    return {
      blockCount: blocks.length,
      totalMinutes,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    };
  }, [blocks]);

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        {header}
        <div className="p-4">
          <CalendarSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      {header}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-red-700 text-sm">{error}</span>
          {onDismissError && (
            <button
              onClick={onDismissError}
              className="text-red-500 hover:text-red-700"
              aria-label="Dismiss error"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Instructions (edit mode only) */}
      {mode === 'edit' && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <span className="text-blue-600">💡</span>
            <span>
              <strong>Click and drag</strong> on the calendar to mark times when you&apos;re
              available. Click on a green block to remove it.
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      {showNavigation && (
        <div className="px-4 py-3 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
              aria-label="Previous week"
            >
              ← Prev
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
            <button
              onClick={goToNext}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
              aria-label="Next week"
            >
              Next →
            </button>
          </div>
          <div className="text-sm font-medium text-gray-700">{weekLabel}</div>
          <div className="text-sm text-gray-500">
            {stats.blockCount} {stats.blockCount === 1 ? 'block' : 'blocks'} •{' '}
            {stats.totalHours} hrs
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="p-4">
        {calendarReady && (
          <FullCalendar
            key={calendarKey}
            plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
            initialView="timeGridWeek"
            initialDate={currentDate}
            headerToolbar={false}
            slotMinTime={minTime}
            slotMaxTime={maxTime}
            slotDuration={`00:${slotDuration.toString().padStart(2, '0')}:00`}
            snapDuration={`00:${slotDuration.toString().padStart(2, '0')}:00`}
            allDaySlot={false}
            nowIndicator={true}
            selectable={mode === 'edit'}
            selectMirror={true}
            selectOverlap={false}
            unselectAuto={true}
            events={events}
            select={handleSelect}
            eventClick={handleEventClick}
            validRange={validRange}
            timeZone={timezone === 'local' ? 'local' : timezone}
            height="auto"
            expandRows={true}
            stickyHeaderDates={true}
            dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
            slotLabelFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short',
            }}
            eventTimeFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short',
            }}
            // Styling
            eventDisplay="block"
            eventTextColor="#ffffff"
            eventBackgroundColor="#22c55e"
            eventBorderColor="#16a34a"
            // Accessibility
            eventContent={(eventInfo) => (
              <div
                className="p-1 text-xs overflow-hidden"
                title={mode === 'edit' ? 'Click to remove' : eventInfo.event.title}
                role="button"
                aria-label={`Availability block: ${eventInfo.event.title}${mode === 'edit' ? '. Click to remove.' : ''}`}
              >
                <div className="font-medium truncate">{eventInfo.event.title}</div>
              </div>
            )}
          />
        )}
      </div>

      {/* Summary footer (edit mode) */}
      {mode === 'edit' && blocks.length > 0 && (
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{stats.blockCount}</span>{' '}
            {stats.blockCount === 1 ? 'block' : 'blocks'} selected •{' '}
            <span className="font-medium">{Math.round(stats.totalMinutes)}</span> minutes total
          </div>
          {onChange && (
            <button
              onClick={() => onChange([])}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AvailabilityTimeGrid;
