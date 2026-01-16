/**
 * CalendarTimePicker - Week-view slot selector
 *
 * A visual calendar for selecting an interview time slot from available options.
 * Shows available slots as clickable cells with optional scoring/recommendations.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { DateTime } from 'luxon';

export interface TimeSlot {
  id: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  score?: number; // 0-100, optional for recommendations
  available?: boolean; // default true
}

export interface CalendarTimePickerProps {
  slots: TimeSlot[];
  selectedSlotId?: string | null;
  onSelect: (slot: TimeSlot) => void;
  timezone: string;
  candidateTimezone?: string; // Show dual timezone if provided
  initialDate?: Date;
  slotDuration?: number; // minutes, default 60
  workingHoursStart?: string; // "09:00"
  workingHoursEnd?: string; // "17:00"
  showScores?: boolean;
  className?: string;
}

export function CalendarTimePicker({
  slots,
  selectedSlotId,
  onSelect,
  timezone,
  candidateTimezone,
  initialDate,
  slotDuration = 60,
  workingHoursStart = '09:00',
  workingHoursEnd = '17:00',
  showScores = false,
  className = '',
}: CalendarTimePickerProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const start = initialDate || new Date();
    return DateTime.fromJSDate(start).setZone(timezone).startOf('week').toJSDate();
  });

  // Get week days
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const start = DateTime.fromJSDate(currentWeekStart).setZone(timezone);
    for (let i = 0; i < 7; i++) {
      days.push(start.plus({ days: i }).toJSDate());
    }
    return days;
  }, [currentWeekStart, timezone]);

  // Parse working hours
  const startHour = parseInt(workingHoursStart.split(':')[0], 10);
  const endHour = parseInt(workingHoursEnd.split(':')[0], 10);
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, [startHour, endHour]);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const grouped: Record<string, TimeSlot[]> = {};
    slots.forEach((slot) => {
      const dt = DateTime.fromISO(slot.startTime).setZone(timezone);
      const dayKey = dt.toFormat('yyyy-MM-dd');
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(slot);
    });
    return grouped;
  }, [slots, timezone]);

  // Get slot for a specific day/hour
  const getSlotForCell = useCallback(
    (day: Date, hour: number): TimeSlot | null => {
      const dt = DateTime.fromJSDate(day).setZone(timezone);
      const dayKey = dt.toFormat('yyyy-MM-dd');
      const daySlots = slotsByDay[dayKey] || [];

      return daySlots.find((slot) => {
        const slotStart = DateTime.fromISO(slot.startTime).setZone(timezone);
        return slotStart.hour === hour;
      }) || null;
    },
    [slotsByDay, timezone]
  );

  // Navigation
  const goToPreviousWeek = () => {
    setCurrentWeekStart((prev) =>
      DateTime.fromJSDate(prev).minus({ weeks: 1 }).toJSDate()
    );
  };

  const goToNextWeek = () => {
    setCurrentWeekStart((prev) =>
      DateTime.fromJSDate(prev).plus({ weeks: 1 }).toJSDate()
    );
  };

  const goToToday = () => {
    setCurrentWeekStart(
      DateTime.now().setZone(timezone).startOf('week').toJSDate()
    );
  };

  // Week label
  const weekLabel = useMemo(() => {
    const start = DateTime.fromJSDate(weekDays[0]).setZone(timezone);
    const end = DateTime.fromJSDate(weekDays[6]).setZone(timezone);
    if (start.month === end.month) {
      return `${start.toFormat('MMMM d')} - ${end.toFormat('d, yyyy')}`;
    }
    return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d, yyyy')}`;
  }, [weekDays, timezone]);

  // Get score color
  const getScoreColor = (score?: number): string => {
    if (score === undefined) return 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300';
    if (score >= 80) return 'bg-emerald-100 hover:bg-emerald-200 border-emerald-400';
    if (score >= 60) return 'bg-amber-100 hover:bg-amber-200 border-amber-300';
    return 'bg-gray-100 hover:bg-gray-200 border-gray-300';
  };

  // Selected slot details
  const selectedSlot = useMemo(() => {
    return slots.find((s) => s.id === selectedSlotId);
  }, [slots, selectedSlotId]);

  // Best recommendation
  const bestSlot = useMemo(() => {
    if (!showScores) return null;
    return slots
      .filter((s) => s.available !== false && s.score !== undefined)
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  }, [slots, showScores]);

  // Check if day is in the past
  const isPastDay = (day: Date): boolean => {
    return DateTime.fromJSDate(day).setZone(timezone).startOf('day') < DateTime.now().setZone(timezone).startOf('day');
  };

  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={goToPreviousWeek}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
              title="Previous week"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={goToNextWeek}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
              title="Next week"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="ml-1 sm:ml-2 text-xs sm:text-sm font-medium text-gray-900">{weekLabel}</span>
          </div>

          {candidateTimezone && candidateTimezone !== timezone && (
            <div className="text-xs text-gray-500">
              Showing in your time
            </div>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="w-16 p-2 text-xs font-medium text-gray-500 border-b border-gray-200" />
              {weekDays.map((day, index) => {
                const dt = DateTime.fromJSDate(day).setZone(timezone);
                const isToday = dt.hasSame(DateTime.now().setZone(timezone), 'day');
                const isWeekend = index === 0 || index === 6;
                const isPast = isPastDay(day);

                return (
                  <th
                    key={index}
                    className={`p-2 text-center border-b border-l border-gray-200 ${
                      isToday ? 'bg-[#1a5f5f]/5' : isWeekend ? 'bg-gray-50' : ''
                    } ${isPast ? 'opacity-50' : ''}`}
                  >
                    <div className={`text-xs font-medium ${isToday ? 'text-[#1a5f5f]' : 'text-gray-500'}`}>
                      {dt.toFormat('EEE')}
                    </div>
                    <div className={`text-lg font-semibold ${isToday ? 'text-[#1a5f5f]' : 'text-gray-900'}`}>
                      {dt.toFormat('d')}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time, timeIndex) => {
              const hour = parseInt(time.split(':')[0], 10);

              return (
                <tr key={time}>
                  <td className="p-2 text-xs font-medium text-gray-500 text-right border-r border-gray-200">
                    {DateTime.now().set({ hour, minute: 0 }).toFormat('h a')}
                  </td>
                  {weekDays.map((day, dayIndex) => {
                    const slot = getSlotForCell(day, hour);
                    const isSelected = slot?.id === selectedSlotId;
                    const isBest = slot?.id === bestSlot?.id;
                    const isWeekend = dayIndex === 0 || dayIndex === 6;
                    const isPast = isPastDay(day);
                    const isAvailable = slot && slot.available !== false && !isPast;

                    return (
                      <td
                        key={dayIndex}
                        className={`p-1 border-l border-t border-gray-100 h-12 ${
                          isWeekend ? 'bg-gray-50/50' : ''
                        } ${isPast ? 'opacity-40' : ''}`}
                      >
                        {slot && (
                          <button
                            onClick={() => isAvailable && onSelect(slot)}
                            disabled={!isAvailable}
                            className={`
                              w-full h-full rounded-lg border-2 transition-all
                              flex items-center justify-center text-xs font-medium
                              ${isSelected
                                ? 'bg-[#1a5f5f] border-[#1a5f5f] text-white shadow-md'
                                : isAvailable
                                  ? `${getScoreColor(slot.score)} cursor-pointer`
                                  : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                              }
                              ${isBest && !isSelected && showScores ? 'ring-2 ring-[#e8b44f] ring-offset-1' : ''}
                            `}
                          >
                            {isSelected && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {!isSelected && showScores && slot.score !== undefined && (
                              <span className="text-[10px]">{slot.score}</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 sm:px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* Selected slot info */}
          <div className="text-xs sm:text-sm">
            {selectedSlot ? (
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1a5f5f]" />
                <span className="text-gray-600">Selected:</span>
                <span className="font-medium text-gray-900">
                  {DateTime.fromISO(selectedSlot.startTime).setZone(timezone).toFormat('EEE, MMM d \'at\' h:mm a')}
                </span>
                {candidateTimezone && candidateTimezone !== timezone && (
                  <span className="text-gray-500 text-xs hidden sm:inline">
                    ({DateTime.fromISO(selectedSlot.startTime).setZone(candidateTimezone).toFormat('h:mm a')})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-500">Select a time slot</span>
            )}
          </div>

          {/* Legend */}
          {showScores && (
            <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-400" />
                <span className="hidden sm:inline">Best fit</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                <span className="hidden sm:inline">Good</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-[#e8b44f]" />
                <span className="hidden sm:inline">Top pick</span>
              </div>
            </div>
          )}
        </div>

        {/* Best recommendation card */}
        {showScores && bestSlot && bestSlot.id !== selectedSlotId && (
          <div className="mt-3 p-3 bg-[#e8b44f]/10 border border-[#e8b44f]/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#e8b44f]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-medium text-gray-900">Recommended:</span>
                <span className="text-sm text-gray-600">
                  {DateTime.fromISO(bestSlot.startTime).setZone(timezone).toFormat('EEE, MMM d \'at\' h:mm a')}
                </span>
                <span className="text-xs text-[#e8b44f] font-medium">Score: {bestSlot.score}</span>
              </div>
              <button
                onClick={() => onSelect(bestSlot)}
                className="px-3 py-1 text-xs font-medium text-[#1a5f5f] hover:bg-[#1a5f5f]/10 rounded transition-colors"
              >
                Select
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CalendarTimePicker;
