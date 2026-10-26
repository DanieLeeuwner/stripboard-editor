"use client";

import DropdownButton from "./DropdownButton";

export function Dropdown({
  label,
  align = "right",
  children,
}: {
  label: React.ReactNode;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <DropdownButton
      label={label}
      align={align}
      buttonClassName="px-3.5 py-1.5 rounded transition-all text-sm bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-1.5"
      menuClassName="min-w-[11rem] max-h-[70vh] overflow-y-auto rounded-md bg-[#0d2b52] border border-white/15 shadow-xl py-1 z-50"
    >
      {(close) => <div onClick={close}>{children}</div>}
    </DropdownButton>
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
