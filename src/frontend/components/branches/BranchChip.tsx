"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import { Dropdown, DropdownItem } from "../ToolbarDropdown";
import BranchDialog, { type BranchControls } from "./BranchDialog";

const BranchIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="8" r="2.5" />
    <path d="M6 7.5v9" /><path d="M18 10.5c0 4-6 3.5-11 7" />
  </svg>
);

/** The branch being edited (or looked at), always in sight in the header,
 *  with quick switching and the way into the branches dialog. */
export default function BranchChip({ controls, source }: { controls: BranchControls; source: "edit" | "view" }) {
  const [dialog, setDialog] = useState<null | "browse" | "create">(null);
  const [error, setError] = useState<string | null>(null);
  const { history, current, onOpen, onCreate } = controls;
  const branch = history.branches.find((b) => b.id === current);
  if (!branch) return null;

  const open = (mode: "browse" | "create") => {
    track("branches-open", { source, mode });
    setDialog(mode);
  };

  const switchTo = async (id: string) => {
    if (id === current) return;
    setError(null);
    try {
      await onOpen(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the branch");
    }
  };

  const label = (
    <span className={`inline-flex items-center gap-1.5 max-w-[12rem] ${branch.is_main ? "opacity-70" : ""}`}>
      {BranchIcon}
      <span className="truncate">{branch.name}</span>
      {branch.parent_changed && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Its parent has new changes" />
      )}
    </span>
  );

  return (
    <>
      <Dropdown label={label} align="left">
        {history.branches.filter((b) => !b.closed_at).map((b) => (
          <DropdownItem
            key={b.id}
            onClick={() => void switchTo(b.id)}
            hint={b.id === current ? (onCreate ? "editing" : "showing") : b.parent_changed ? "changes" : undefined}
          >
            <span className={b.id === current ? "font-semibold" : ""}>{b.name}</span>
          </DropdownItem>
        ))}
        <div className="my-1 border-t border-white/15" />
        {onCreate && <DropdownItem onClick={() => open("create")}>New branch from {branch.name}…</DropdownItem>}
        <DropdownItem onClick={() => open("browse")}>{onCreate ? "Manage branches…" : "History…"}</DropdownItem>
      </Dropdown>
      {error && <span className="text-red-300 text-xs">{error}</span>}
      {dialog && (
        <BranchDialog controls={controls} initialMode={dialog === "create" ? "create" : null} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
