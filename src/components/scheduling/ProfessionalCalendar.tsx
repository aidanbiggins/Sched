/**
 * Professional Calendar Component
 *
 * A polished, interactive calendar for selecting availability.
 * Features drag-to-create, resize, and move blocks.
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { DateTime } from 'luxon';
import { CalendarBlock } from './CalendarBlock';
import { useCalendarDrag } from './useCalendarDrag';
import {
  WorkingHours,
  DEFAULT_WORKING_HOURS,
  DEFAULT_DAY_RANGE,
  parseTimeToMinutes,
  minutesToPixels,
  getWeekDays,
  formatDayHeader,
  formatTime,
  getTimeLabels,
  getGridHeight,
  getBeforeWorkingHoursHeight,
  getAfterWorkingHoursHeight,
  isSameDay,
  generateBlockId,
  HOUR_HEIGHT,
} from './calendarUtils';
import type { AvailabilityBlock } from '@/lib/scheduling/availabilityBlocks';

// Timezone options
export const TIMEZONE_OPTIONS = [
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

export interface ProfessionalCalendarProps {
  blocks: AvailabilityBlock[];
  onChange: (blocks: AvailabilityBlock[]) => void;
  timezone: string;
  onTimezoneChange?: (tz: string) => void;
  initialDate?: Date;
  validRange?: { start: Date; end: Date };
  workingHours?: WorkingHours;
  dayStart?: string;
  dayEnd?: string;
  slotDuration?: number;
  readonly?: boolean;
  loading?: boolean;
  className?: string;
}

export function ProfessionalCalendar({
  blocks,
  onChange,
  timezone,
  onTimezoneChange,
  initialDate,
  validRange,
  workingHours = DEFAULT_WORKING_HOURS,
  dayStart = DEFAULT_DAY_RANGE.start,
  dayEnd = DEFAULT_DAY_RANGE.end,
  slotDuration = 15,
  readonly = false,
  loading = false,
  className = '',
}: ProfessionalCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const start = initialDate || new Date();
    return DateTime.fromJSDate(start).setZone(timezone).startOf('week').toJSDate();
  });

  // Derived values
  const dayStartMinutes = parseTimeToMinutes(dayStart);
  const dayEndMinutes = parseTimeToMinutes(dayEnd);
  const gridHeight = getGridHeight(dayStart, dayEnd);
  const timeLabels = getTimeLabels(dayStart, dayEnd);
  const weekDays = useMemo(() => getWeekDays(currentWeekStart, timezone), [currentWeekStart, timezone]);

  // Working hours overlay heights
  const beforeWorkingHeight = getBeforeWorkingHoursHeight(dayStart, workingHours.start);
  const afterWorkingHeight = getAfterWorkingHoursHeight(dayEnd, workingHours.end);

  // Block manipulation handlers
  const handleCreateBlock = useCallback(
    (dayIndex: number, startMinutes: number, endMinutes: number) => {
      const day = weekDays[dayIndex];
      const startDt = DateTime.fromJSDate(day)
        .setZone(timezone)
        .startOf('day')
        .plus({ minutes: startMinutes });
      const endDt = DateTime.fromJSDate(day)
        .setZone(timezone)
        .startOf('day')
        .plus({ minutes: endMinutes });

      const newBlock: AvailabilityBlock = {
        id: generateBlockId(),
        startUtcIso: startDt.toUTC().toISO() || '',
        endUtcIso: endDt.toUTC().toISO() || '',
      };

      onChange([...blocks, newBlock]);
    },
    [weekDays, timezone, blocks, onChange]
  );

  const handleResizeBlock = useCallback(
    (blockId: string, startMinutes: number, endMinutes: number) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      const originalStart = DateTime.fromISO(block.startUtcIso).setZone(timezone);
      const day = originalStart.startOf('day');

      const newStart = day.plus({ minutes: startMinutes });
      const newEnd = day.plus({ minutes: endMinutes });

      const updatedBlocks = blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              startUtcIso: newStart.toUTC().toISO() || '',
              endUtcIso: newEnd.toUTC().toISO() || '',
            }
          : b
      );

      onChange(updatedBlocks);
    },
    [blocks, timezone, onChange]
  );

  const handleMoveBlock = useCallback(
    (blockId: string, dayIndex: number, startMinutes: number, endMinutes: number) => {
      const day = weekDays[dayIndex];
      const startDt = DateTime.fromJSDate(day)
        .setZone(timezone)
        .startOf('day')
        .plus({ minutes: startMinutes });
      const endDt = DateTime.fromJSDate(day)
        .setZone(timezone)
        .startOf('day')
        .plus({ minutes: endMinutes });

      const updatedBlocks = blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              startUtcIso: startDt.toUTC().toISO() || '',
              endUtcIso: endDt.toUTC().toISO() || '',
            }
          : b
      );

      onChange(updatedBlocks);
    },
    [weekDays, timezone, blocks, onChange]
  );

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      onChange(blocks.filter((b) => b.id !== blockId));
    },
    [blocks, onChange]
  );

  // Drag hook
  const {
    preview,
    containerRef,
    startCreate,
    startResizeTop,
    startResizeBottom,
    startMove,
  } = useCalendarDrag({
    dayStartMinutes,
    dayEndMinutes,
    gridHeight,
    onCreateBlock: handleCreateBlock,
    onResizeBlock: handleResizeBlock,
    onMoveBlock: handleMoveBlock,
    disabled: readonly || loading,
  });

  // Navigation
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart((prev) =>
      DateTime.fromJSDate(prev).minus({ weeks: 1 }).toJSDate()
    );
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) =>
      DateTime.fromJSDate(prev).plus({ weeks: 1 }).toJSDate()
    );
  }, []);

  const goToToday = useCallback(() => {
    setCurrentWeekStart(
      DateTime.now().setZone(timezone).startOf('week').toJSDate()
    );
  }, [timezone]);

  // Week label
  const weekLabel = useMemo(() => {
    const start = DateTime.fromJSDate(weekDays[0]).setZone(timezone);
    const end = DateTime.fromJSDate(weekDays[6]).setZone(timezone);
    if (start.month === end.month) {
      return `${start.toFormat('MMMM d')} - ${end.toFormat('d, yyyy')}`;
    }
    return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d, yyyy')}`;
  }, [weekDays, timezone]);

  // Get blocks for a specific day
  const getBlocksForDay = useCallback(
    (dayIndex: number) => {
      const day = weekDays[dayIndex];
      return blocks.filter((block) => {
        const blockStart = new Date(block.startUtcIso);
        return isSameDay(blockStart, day, timezone);
      });
    },
    [blocks, weekDays, timezone]
  );

  // Convert block to display coordinates
  const getBlockPosition = useCallback(
    (block: AvailabilityBlock) => {
      const start = DateTime.fromISO(block.startUtcIso).setZone(timezone);
      const end = DateTime.fromISO(block.endUtcIso).setZone(timezone);
      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = end.hour * 60 + end.minute;

      const top = minutesToPixels(startMinutes, dayStartMinutes);
      const height = minutesToPixels(endMinutes, dayStartMinutes) - top;

      return {
        top,
        height,
        startTime: formatTime(new Date(block.startUtcIso), timezone),
        endTime: formatTime(new Date(block.endUtcIso), timezone),
      };
    },
    [timezone, dayStartMinutes]
  );

  // Handle grid click for creating blocks
  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent, dayIndex: number) => {
      if (readonly || loading) return;

      // Check if clicking on a block
      const target = e.target as HTMLElement;
      if (target.closest('[data-block]')) return;

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        startCreate(dayIndex, e.clientY, rect);
      }
    },
    [readonly, loading, containerRef, startCreate]
  );

  // Check if a day is within valid range
  const isDayInRange = useCallback(
    (day: Date) => {
      if (!validRange) return true;
      const dt = DateTime.fromJSDate(day);
      const start = DateTime.fromJSDate(validRange.start).startOf('day');
      const end = DateTime.fromJSDate(validRange.end).endOf('day');
      return dt >= start && dt <= end;
    },
    [validRange]
  );

  // Stats
  const totalMinutes = useMemo(() => {
    return blocks.reduce((sum, block) => {
      const start = new Date(block.startUtcIso);
      const end = new Date(block.endUtcIso);
      return sum + (end.getTime() - start.getTime()) / 60000;
    }, 0);
  }, [blocks]);

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousWeek}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
              title="Previous week"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={goToNextWeek}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
              title="Next week"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="ml-2 text-sm font-medium text-gray-900">{weekLabel}</span>
          </div>

          {/* Timezone selector */}
          {onTimezoneChange && (
            <select
              value={timezone}
              onChange={(e) => onTimezoneChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-gray-200">
        <div className="p-2" /> {/* Time column spacer */}
        {weekDays.map((day, index) => {
          const { weekday, date } = formatDayHeader(day, timezone);
          const isToday = isSameDay(day, new Date(), timezone);
          const isInRange = isDayInRange(day);
          const isWeekend = index === 0 || index === 6;

          return (
            <div
              key={index}
              className={`
                p-2 text-center border-l border-gray-200
                ${isToday ? 'bg-indigo-50' : isWeekend ? 'bg-gray-50' : 'bg-white'}
                ${!isInRange ? 'opacity-50' : ''}
              `}
            >
              <div className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                {weekday}
              </div>
              <div
                className={`
                  text-lg font-semibold
                  ${isToday ? 'text-indigo-600' : 'text-gray-900'}
                `}
              >
                {date}
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className="relative overflow-auto" style={{ maxHeight: '600px' }}>
        <div
          ref={containerRef}
          data-calendar-grid
          className="grid grid-cols-[70px_repeat(7,1fr)]"
          style={{ height: `${gridHeight}px` }}
        >
          {/* Time labels column */}
          <div className="relative border-r border-gray-200">
            {timeLabels.map((label, index) => (
              <div
                key={label}
                className="absolute right-2 -translate-y-1/2 text-xs text-gray-500 font-medium"
                style={{ top: `${index * HOUR_HEIGHT}px` }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIndex) => {
            const isWeekend = dayIndex === 0 || dayIndex === 6;
            const isInRange = isDayInRange(day);
            const dayBlocks = getBlocksForDay(dayIndex);
            const isWorkingDay = workingHours.days.includes(dayIndex === 0 ? 7 : dayIndex);

            return (
              <div
                key={dayIndex}
                className={`
                  relative border-l border-gray-200
                  ${isWeekend ? 'bg-gray-50/50' : 'bg-white'}
                  ${!isInRange ? 'pointer-events-none opacity-40' : ''}
                  ${!readonly && isInRange ? 'cursor-crosshair' : ''}
                `}
                onPointerDown={(e) => isInRange && handleGridPointerDown(e, dayIndex)}
              >
                {/* Hour lines */}
                {timeLabels.map((_, index) => (
                  <div
                    key={index}
                    className="absolute left-0 right-0 border-t border-gray-100"
                    style={{ top: `${index * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Half-hour lines (lighter) */}
                {timeLabels.slice(0, -1).map((_, index) => (
                  <div
                    key={`half-${index}`}
                    className="absolute left-0 right-0 border-t border-gray-50"
                    style={{ top: `${index * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                  />
                ))}

                {/* Non-working hours overlay - before */}
                {isWorkingDay && beforeWorkingHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 top-0 bg-gray-100/60"
                    style={{ height: `${beforeWorkingHeight}px` }}
                  />
                )}

                {/* Non-working hours overlay - after */}
                {isWorkingDay && afterWorkingHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-gray-100/60"
                    style={{ height: `${afterWorkingHeight}px` }}
                  />
                )}

                {/* Full day non-working overlay for weekends */}
                {!isWorkingDay && (
                  <div className="absolute inset-0 bg-gray-100/40" />
                )}

                {/* Existing blocks */}
                {dayBlocks.map((block) => {
                  const pos = getBlockPosition(block);

                  return (
                    <CalendarBlock
                      key={block.id}
                      id={block.id}
                      top={pos.top}
                      height={pos.height}
                      startTime={pos.startTime}
                      endTime={pos.endTime}
                      dayIndex={dayIndex}
                      readonly={readonly}
                      onDelete={handleDeleteBlock}
                      onResizeTopStart={startResizeTop}
                      onResizeBottomStart={startResizeBottom}
                      onMoveStart={startMove}
                    />
                  );
                })}

                {/* Drag preview */}
                {preview && preview.dayIndex === dayIndex && (
                  <CalendarBlock
                    id="preview"
                    top={preview.top}
                    height={preview.height}
                    startTime=""
                    endTime=""
                    dayIndex={dayIndex}
                    isPreview
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{blocks.length}</span> time block{blocks.length !== 1 ? 's' : ''} selected
            {totalMinutes > 0 && (
              <span className="ml-2">
                ({totalHours > 0 && `${totalHours}h `}{remainingMinutes > 0 && `${remainingMinutes}m`} total)
              </span>
            )}
          </div>
          {!readonly && (
            <div className="text-xs text-gray-500">
              Click and drag to add availability
            </div>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
