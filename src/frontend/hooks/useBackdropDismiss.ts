import { useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

/** Pixels of movement between press and release before it counts as a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Backdrop dismissal that ignores drags.
 *
 * A press that starts inside the panel and ends on the backdrop still fires a
 * click on the backdrop, and a drag across the backdrop also ends in a click.
 * Remember where the press started and only dismiss when it began and ended on
 * the backdrop without moving far.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const press = useRef<{ x: number; y: number } | null>(null);

  return {
    onMouseDown: (e: ReactMouseEvent<HTMLElement>) => {
      press.current = e.target === e.currentTarget ? { x: e.clientX, y: e.clientY } : null;
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const start = press.current;
      press.current = null;
      if (!start || e.target !== e.currentTarget) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD) return;
      onDismiss();
    },
  };
}
