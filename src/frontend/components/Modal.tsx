"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useBackdropDismiss } from "@/hooks/useBackdropDismiss";

const OVERLAY =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/70";
const CARD =
  "bg-white dark:bg-neutral-900 rounded-lg shadow-xl dark:shadow-neutral-900/50 p-6";

const SIZES = {
  sm: "w-[calc(100%-2rem)] sm:w-96 max-w-[calc(100vw-2rem)]",
  md: "w-[calc(100%-2rem)] sm:w-[28rem] max-w-[calc(100vw-2rem)]",
  lg: "w-[calc(100%-2rem)] sm:w-[32rem] max-w-[calc(100vw-2rem)]",
  xl: "w-[calc(100%-2rem)] max-w-5xl",
} as const;

export type ModalSize = keyof typeof SIZES;

/**
 * Modal backdrop and card. Backdrop clicks dismiss unless `dismissible` is
 * false; drags and releases over the card do not.
 */
export default function Modal({
  onClose,
  dismissible = true,
  size = "sm",
  className = "",
  onMouseUp,
  children,
}: {
  onClose: () => void;
  dismissible?: boolean;
  size?: ModalSize;
  className?: string;
  onMouseUp?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const backdropDismiss = useBackdropDismiss(onClose);

  return (
    <div
      className={OVERLAY}
      onMouseUp={onMouseUp}
      {...(dismissible ? backdropDismiss : {})}
    >
      <div className={`${CARD} ${SIZES[size]} ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
