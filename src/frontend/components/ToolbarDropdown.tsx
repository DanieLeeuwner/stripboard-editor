"use client";

import { useRef, useState, useEffect } from "react";

export function Dropdown({
  label,
  align = "right",
  children,
}: {
  label: React.ReactNode;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3.5 py-1.5 rounded transition-all text-sm bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-1.5"
      >
        {label}
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className="opacity-70" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-1 min-w-[11rem] max-h-[70vh] overflow-y-auto rounded-md bg-[#0d2b52] border border-white/15 shadow-xl py-1 z-50`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  disabled,
  hint,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-sm text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span>{children}</span>
      {hint && <span className="text-[10px] uppercase tracking-wide opacity-60">{hint}</span>}
    </button>
  );
}
