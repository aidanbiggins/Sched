/**
 * Calendar Drag Hook
 *
 * Handles drag interactions for creating, resizing, and moving blocks.
 * Uses pointer events for unified mouse/touch support.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  pixelsToMinutes,
  minutesToPixels,
  snapToSlot,
  parseTimeToMinutes,
  clamp,
  HOUR_HEIGHT,
  MINUTES_PER_SLOT,
} from './calendarUtils';

export type DragMode = 'none' | 'create' | 'resize-top' | 'resize-bottom' | 'move';

export interface DragState {
  mode: DragMode;
  blockId: string | null;
  dayIndex: number;
  startY: number;
  currentY: number;
  originalTop: number;
  originalBottom: number;
}

export interface DragPreview {
  dayIndex: number;
  top: number;
  height: number;
}

interface UseCalendarDragOptions {
  dayStartMinutes: number;
  dayEndMinutes: number;
  gridHeight: number;
  onCreateBlock: (dayIndex: number, startMinutes: number, endMinutes: number) => void;
  onResizeBlock: (blockId: string, startMinutes: number, endMinutes: number) => void;
  onMoveBlock: (blockId: string, dayIndex: number, startMinutes: number, endMinutes: number) => void;
  disabled?: boolean;
}

export function useCalendarDrag({
  dayStartMinutes,
  dayEndMinutes,
  gridHeight,
  onCreateBlock,
  onResizeBlock,
  onMoveBlock,
  disabled = false,
}: UseCalendarDragOptions) {
  const [dragState, setDragState] = useState<DragState>({
    mode: 'none',
    blockId: null,
    dayIndex: -1,
    startY: 0,
    currentY: 0,
    originalTop: 0,
    originalBottom: 0,
  });

  const [preview, setPreview] = useState<DragPreview | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Convert pixel Y to snapped minutes
  const pixelYToMinutes = useCallback(
    (y: number) => {
      const rawMinutes = pixelsToMinutes(y, dayStartMinutes);
      return clamp(snapToSlot(rawMinutes), dayStartMinutes, dayEndMinutes);
    },
    [dayStartMinutes, dayEndMinutes]
  );

  // Convert minutes to pixel Y
  const minutesToPixelY = useCallback(
    (minutes: number) => {
      return minutesToPixels(minutes, dayStartMinutes);
    },
    [dayStartMinutes]
  );

  // Start creating a new block
  const startCreate = useCallback(
    (dayIndex: number, clientY: number, containerRect: DOMRect) => {
      if (disabled) return;

      const y = clientY - containerRect.top;
      setDragState({
        mode: 'create',
        blockId: null,
        dayIndex,
        startY: y,
        currentY: y,
        originalTop: 0,
        originalBottom: 0,
      });

      const minutes = pixelYToMinutes(y);
      const pixelTop = minutesToPixelY(minutes);
      setPreview({
        dayIndex,
        top: pixelTop,
        height: HOUR_HEIGHT / 4, // Minimum 15 min
      });
    },
    [disabled, pixelYToMinutes, minutesToPixelY]
  );

  // Start resizing a block from top
  const startResizeTop = useCallback(
    (blockId: string, dayIndex: number, currentTop: number, currentBottom: number) => {
      if (disabled) return;

      setDragState({
        mode: 'resize-top',
        blockId,
        dayIndex,
        startY: currentTop,
        currentY: currentTop,
        originalTop: currentTop,
        originalBottom: currentBottom,
      });
    },
    [disabled]
  );

  // Start resizing a block from bottom
  const startResizeBottom = useCallback(
    (blockId: string, dayIndex: number, currentTop: number, currentBottom: number) => {
      if (disabled) return;

      setDragState({
        mode: 'resize-bottom',
        blockId,
        dayIndex,
        startY: currentBottom,
        currentY: currentBottom,
        originalTop: currentTop,
        originalBottom: currentBottom,
      });
    },
    [disabled]
  );

  // Start moving a block
  const startMove = useCallback(
    (blockId: string, dayIndex: number, clientY: number, containerRect: DOMRect, blockTop: number, blockBottom: number) => {
      if (disabled) return;

      const y = clientY - containerRect.top;
      setDragState({
        mode: 'move',
        blockId,
        dayIndex,
        startY: y,
        currentY: y,
        originalTop: blockTop,
        originalBottom: blockBottom,
      });
    },
    [disabled]
  );

  // Handle pointer move during drag
  const handlePointerMove = useCallback(
    (clientY: number, containerRect: DOMRect, currentDayIndex?: number) => {
      if (dragState.mode === 'none') return;

      const y = clamp(clientY - containerRect.top, 0, gridHeight);
      const newDayIndex = currentDayIndex ?? dragState.dayIndex;

      setDragState((prev) => ({ ...prev, currentY: y, dayIndex: newDayIndex }));

      if (dragState.mode === 'create') {
        const startMinutes = pixelYToMinutes(dragState.startY);
        const endMinutes = pixelYToMinutes(y);
        const top = minutesToPixelY(Math.min(startMinutes, endMinutes));
        const bottom = minutesToPixelY(Math.max(startMinutes, endMinutes));
        const height = Math.max(bottom - top, HOUR_HEIGHT / 4);

        setPreview({
          dayIndex: newDayIndex,
          top: Math.min(startMinutes, endMinutes) === startMinutes ? top : bottom - height,
          height,
        });
      } else if (dragState.mode === 'resize-top') {
        const newTopMinutes = pixelYToMinutes(y);
        const bottomMinutes = pixelsToMinutes(dragState.originalBottom, dayStartMinutes);
        const clampedTop = Math.min(newTopMinutes, bottomMinutes - MINUTES_PER_SLOT);
        const top = minutesToPixelY(clampedTop);

        setPreview({
          dayIndex: dragState.dayIndex,
          top,
          height: dragState.originalBottom - top,
        });
      } else if (dragState.mode === 'resize-bottom') {
        const newBottomMinutes = pixelYToMinutes(y);
        const topMinutes = pixelsToMinutes(dragState.originalTop, dayStartMinutes);
        const clampedBottom = Math.max(newBottomMinutes, topMinutes + MINUTES_PER_SLOT);
        const bottom = minutesToPixelY(clampedBottom);

        setPreview({
          dayIndex: dragState.dayIndex,
          top: dragState.originalTop,
          height: bottom - dragState.originalTop,
        });
      } else if (dragState.mode === 'move') {
        const deltaY = y - dragState.startY;
        const originalHeight = dragState.originalBottom - dragState.originalTop;
        let newTop = dragState.originalTop + deltaY;

        // Snap the top to grid
        const newTopMinutes = pixelYToMinutes(newTop);
        newTop = minutesToPixelY(newTopMinutes);

        // Clamp to grid bounds
        newTop = clamp(newTop, 0, gridHeight - originalHeight);

        setPreview({
          dayIndex: newDayIndex,
          top: newTop,
          height: originalHeight,
        });
      }
    },
    [dragState, gridHeight, pixelYToMinutes, minutesToPixelY, dayStartMinutes]
  );

  // End drag and commit changes
  const endDrag = useCallback(() => {
    if (dragState.mode === 'none' || !preview) {
      setDragState((prev) => ({ ...prev, mode: 'none' }));
      setPreview(null);
      return;
    }

    const topMinutes = pixelsToMinutes(preview.top, dayStartMinutes);
    const bottomMinutes = pixelsToMinutes(preview.top + preview.height, dayStartMinutes);
    const snappedStart = snapToSlot(topMinutes);
    const snappedEnd = snapToSlot(bottomMinutes);

    if (snappedEnd > snappedStart) {
      if (dragState.mode === 'create') {
        onCreateBlock(preview.dayIndex, snappedStart, snappedEnd);
      } else if (
        (dragState.mode === 'resize-top' || dragState.mode === 'resize-bottom') &&
        dragState.blockId
      ) {
        onResizeBlock(dragState.blockId, snappedStart, snappedEnd);
      } else if (dragState.mode === 'move' && dragState.blockId) {
        onMoveBlock(dragState.blockId, preview.dayIndex, snappedStart, snappedEnd);
      }
    }

    setDragState({
      mode: 'none',
      blockId: null,
      dayIndex: -1,
      startY: 0,
      currentY: 0,
      originalTop: 0,
      originalBottom: 0,
    });
    setPreview(null);
  }, [dragState, preview, dayStartMinutes, onCreateBlock, onResizeBlock, onMoveBlock]);

  // Cancel drag
  const cancelDrag = useCallback(() => {
    setDragState({
      mode: 'none',
      blockId: null,
      dayIndex: -1,
      startY: 0,
      currentY: 0,
      originalTop: 0,
      originalBottom: 0,
    });
    setPreview(null);
  }, []);

  // Global pointer events during drag
  useEffect(() => {
    if (dragState.mode === 'none') return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        handlePointerMove(e.clientY, rect);
      }
    };

    const handleGlobalPointerUp = () => {
      endDrag();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    };

    document.addEventListener('pointermove', handleGlobalPointerMove);
    document.addEventListener('pointerup', handleGlobalPointerUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointermove', handleGlobalPointerMove);
      document.removeEventListener('pointerup', handleGlobalPointerUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState.mode, handlePointerMove, endDrag, cancelDrag]);

  return {
    dragState,
    preview,
    containerRef,
    startCreate,
    startResizeTop,
    startResizeBottom,
    startMove,
    handlePointerMove,
    endDrag,
    cancelDrag,
    isDragging: dragState.mode !== 'none',
  };
}
