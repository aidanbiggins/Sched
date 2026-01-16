/**
 * Calendar Block Component
 *
 * Renders an individual availability block with resize handles
 * and drag functionality.
 */

'use client';

import { useCallback, useRef } from 'react';

interface CalendarBlockProps {
  id: string;
  top: number;
  height: number;
  startTime: string;
  endTime: string;
  dayIndex: number;
  readonly?: boolean;
  isPreview?: boolean;
  onDelete?: (id: string) => void;
  onResizeTopStart?: (id: string, dayIndex: number, top: number, bottom: number) => void;
  onResizeBottomStart?: (id: string, dayIndex: number, top: number, bottom: number) => void;
  onMoveStart?: (id: string, dayIndex: number, clientY: number, rect: DOMRect, top: number, bottom: number) => void;
}

export function CalendarBlock({
  id,
  top,
  height,
  startTime,
  endTime,
  dayIndex,
  readonly = false,
  isPreview = false,
  onDelete,
  onResizeTopStart,
  onResizeBottomStart,
  onMoveStart,
}: CalendarBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);

  const handleResizeTopPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly || isPreview) return;
      e.preventDefault();
      e.stopPropagation();
      onResizeTopStart?.(id, dayIndex, top, top + height);
    },
    [readonly, isPreview, id, dayIndex, top, height, onResizeTopStart]
  );

  const handleResizeBottomPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly || isPreview) return;
      e.preventDefault();
      e.stopPropagation();
      onResizeBottomStart?.(id, dayIndex, top, top + height);
    },
    [readonly, isPreview, id, dayIndex, top, height, onResizeBottomStart]
  );

  const handleMovePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly || isPreview) return;
      e.preventDefault();
      e.stopPropagation();
      const container = blockRef.current?.closest('[data-calendar-grid]');
      if (container) {
        const rect = container.getBoundingClientRect();
        onMoveStart?.(id, dayIndex, e.clientY, rect, top, top + height);
      }
    },
    [readonly, isPreview, id, dayIndex, top, height, onMoveStart]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete?.(id);
    },
    [id, onDelete]
  );

  // Minimum height to show time label
  const showTimeLabel = height >= 30;
  const showDeleteButton = !readonly && !isPreview && height >= 40;

  return (
    <div
      ref={blockRef}
      className={`
        absolute left-1 right-1 rounded-lg overflow-hidden
        ${isPreview
          ? 'bg-indigo-400/60 border-2 border-dashed border-indigo-500'
          : 'bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-md'
        }
        ${!readonly && !isPreview ? 'cursor-grab active:cursor-grabbing' : ''}
        transition-shadow duration-150
        ${!readonly && !isPreview ? 'hover:shadow-lg hover:from-indigo-400 hover:to-indigo-500' : ''}
        select-none
      `}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`,
        zIndex: isPreview ? 50 : 10,
      }}
      onPointerDown={!readonly && !isPreview ? handleMovePointerDown : undefined}
    >
      {/* Top resize handle */}
      {!readonly && !isPreview && (
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-white/20 transition-colors z-20"
          onPointerDown={handleResizeTopPointerDown}
        />
      )}

      {/* Block content */}
      <div className="h-full flex flex-col justify-center px-2 py-1 pointer-events-none">
        {showTimeLabel && (
          <div className="text-white text-xs font-semibold truncate">
            {startTime}
          </div>
        )}
        {showTimeLabel && height >= 45 && (
          <div className="text-white/80 text-xs truncate">
            {endTime}
          </div>
        )}
      </div>

      {/* Delete button */}
      {showDeleteButton && (
        <button
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/20 hover:bg-white/40
                     flex items-center justify-center transition-colors z-20 pointer-events-auto"
          onClick={handleDelete}
          title="Remove block"
        >
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}

      {/* Bottom resize handle */}
      {!readonly && !isPreview && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-white/20 transition-colors z-20"
          onPointerDown={handleResizeBottomPointerDown}
        />
      )}
    </div>
  );
}
