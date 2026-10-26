"use client";

import { useEffect, useState } from "react";
import type { BranchMeta, ProjectHistory } from "@/lib/api";
import BranchGraph, { laneColor, relativeTime } from "./BranchGraph";
import { layoutHistory } from "./historyLayout";
import MergeReview, { type MergePlan } from "./MergeReview";
import { track } from "@/lib/track";

/** What the branch chip and dialog can do. Without the editing callbacks
 *  (a view link) branches can only be looked at. Callbacks throw an Error
 *  whose message is shown to the user. */
export interface BranchControls {
  history: ProjectHistory;
  current: string;
  // A fork: the name of the project it follows, and the branch of it its main follows
  upstreamName?: string | null;
  upstreamBranch?: string | null;
  onOpen: (id: string) => Promise<void>;
  onCreate?: (name: string, from: string) => Promise<void>;
  onRename?: (id: string, name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  // Works out the merge of `source` into `target` for review; null when the
  // user chose to stay where they are
  onPrepareMerge?: (target: string, source: string) => Promise<MergePlan | null>;
}

type Mode = null | "create" | "rename" | "delete";

const button =
  "w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent";
const primary =
  "px-3 py-1.5 text-sm rounded bg-[#113768] text-white font-medium hover:bg-[#0d2a50] transition-colors disabled:opacity-60";

export default function BranchDialog({
  controls,
  initialMode = null,
  onClose,
}: {
  controls: BranchControls;
  initialMode?: Mode;
  onClose: () => void;
}) {
  const { history, current, upstreamName, upstreamBranch, onOpen, onCreate, onRename, onDelete, onPrepareMerge } = controls;
  const editable = !!onCreate;
  const [selected, setSelected] = useState(current);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);

  const byId = new Map(history.branches.map((b) => [b.id, b]));
  // The selection may have just been deleted
  const branch: BranchMeta | undefined = byId.get(selected) ?? byId.get(current);
  const parent = branch?.parent ? byId.get(branch.parent) : undefined;
  const parentName = parent?.name ?? (branch?.upstream ? upstreamName ?? "the original" : null);
  const lane = branch ? layoutHistory(history).spans.find((s) => s.branch === branch.id)?.lane ?? 0 : 0;
  // Merged branches under this one go with it when it is deleted
  const mergedUnder = (() => {
    let count = 0;
    let level = branch ? [branch.id] : [];
    while (level.length) {
      const next = history.branches.filter((b) => b.closed_at && b.parent !== null && level.includes(b.parent)).map((b) => b.id);
      count += next.length;
      level = next;
    }
    return count;
  })();
  // Merging into the parent closes a branch, which would strand branches still open on it
  const hasOpenChildren = branch ? history.branches.some((b) => b.parent === branch.id && !b.closed_at) : false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (plan) track("branch-merge-cancel", { kind: plan.eventKind, how: "close" });
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, onClose]);

  /** Closing while a merge is under review abandons it. */
  const dismiss = () => {
    if (plan) track("branch-merge-cancel", { kind: plan.eventKind, how: "close" });
    onClose();
  };

  const select = (id: string) => {
    setSelected(id);
    setMode(null);
    setError(null);
  };

  const startMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setName(m === "rename" && branch ? branch.name : "");
  };

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!branch) return null;
  const isCurrent = branch.id === current;
  // Where this branch takes changes from: its parent, or for a fork's main the original
  const parentId = parent?.id ?? (branch.upstream ? upstreamBranch : null);
  const prepare = (target: string, source: string) => run(async () => {
    const p = await onPrepareMerge!(target, source);
    if (p) setPlan(p);
  });

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 font-sans whitespace-normal" onClick={dismiss}>
      <div
        className="bg-white dark:bg-neutral-900 [--branch-dot-hole:#fff] dark:[--branch-dot-hole:#171717] rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-xl dark:shadow-neutral-900/50 w-[min(60rem,94vw)] h-[min(36rem,88vh)] flex flex-col text-neutral-900 dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
          <h2 className="font-semibold">{plan ? "Merge" : "Branches"}</h2>
          <button onClick={dismiss} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-lg" aria-label="Close">
            ×
          </button>
        </div>
        {plan ? (
          <MergeReview plan={plan} onCancel={() => setPlan(null)} onDone={onClose} />
        ) : (
        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          <div className="flex-1 min-w-0 overflow-auto p-3">
            <BranchGraph history={history} upstreamName={upstreamName} current={current} selected={branch.id} onSelect={select} />
          </div>

          <div className="sm:w-72 flex-shrink-0 border-t sm:border-t-0 sm:border-l border-neutral-200 dark:border-neutral-700 p-5 overflow-auto">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: laneColor(lane) }} />
              <h3 className="font-semibold truncate">{branch.name}</h3>
              {branch.is_main && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                  main
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1" suppressHydrationWarning>
              {branch.upstream
                ? `Follows ${parentName}`
                : parent
                  ? `Started from ${parent.name}, ${relativeTime(branch.created_at)}`
                  : `Started ${relativeTime(branch.created_at)}`}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3" suppressHydrationWarning>
              Last edited {relativeTime(branch.updated_at)}
            </p>
            {branch.is_main && !branch.upstream && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">The view link shows this branch.</p>
            )}
            {branch.parent_changed && parentName && (
              <p className="text-xs rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-2.5 py-2 mb-3">
                {parentName} has changed since this branch last took in its changes.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {branch.closed_at ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-300 py-1" suppressHydrationWarning>
                  Merged into {parentName ?? "its parent"} {relativeTime(branch.closed_at)}. Its changes live on there.
                </p>
              ) : isCurrent ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-300 py-1">
                  {editable ? "You are editing this branch." : "You are looking at this branch."}
                </p>
              ) : (
                <button className={button} disabled={busy} onClick={() => run(() => onOpen(branch.id), onClose)}>
                  {editable ? "Open" : "Look at this branch"}
                </button>
              )}

              {editable && !branch.closed_at && (
                <>
                  {mode === "create" ? (
                    <NameForm
                      label={`New branch from ${branch.name}`}
                      value={name} onChange={setName} busy={busy} submit="Create"
                      onCancel={() => setMode(null)}
                      onSubmit={() => run(() => onCreate!(name.trim(), branch.id), onClose)}
                    />
                  ) : (
                    <button className={button} disabled={busy} onClick={() => startMode("create")}
                      title="A copy of this branch to work on, without changing this one">
                      New branch from here
                    </button>
                  )}

                  {parent && (
                    <button className={button} disabled={busy || !onPrepareMerge || hasOpenChildren} onClick={() => prepare(parent.id, branch.id)}
                      title={hasOpenChildren
                        ? "Other branches start from this one. Merge or delete them first."
                        : `Bring what changed on ${branch.name} into ${parent.name}. ${branch.name} is closed afterwards.`}>
                      Merge into {parent.name}
                    </button>
                  )}
                  {parentName && parentId && (
                    <button className={button} disabled={busy || !onPrepareMerge} onClick={() => prepare(branch.id, parentId)}
                      title={`Bring what changed on ${parentName} into ${branch.name}`}>
                      Update from {parentName}
                    </button>
                  )}

                  {!branch.is_main && (mode === "rename" ? (
                    <NameForm
                      label="Rename branch"
                      value={name} onChange={setName} busy={busy} submit="Rename"
                      onCancel={() => setMode(null)}
                      onSubmit={() => run(() => onRename!(branch.id, name.trim()))}
                    />
                  ) : mode === "delete" ? (
                    <div className="rounded border border-red-200 dark:border-red-900 p-3 text-sm">
                      <p className="mb-3 text-neutral-700 dark:text-neutral-300">
                        Delete <span className="font-medium">{branch.name}</span>? Its design is lost
                        {mergedUnder > 0 && `, along with ${mergedUnder === 1 ? "the branch" : `${mergedUnder} branches`} merged into it`}.
                        This cannot be undone.
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button className="px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600" onClick={() => setMode(null)}>
                          Cancel
                        </button>
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-red-500 dark:bg-red-600 text-white font-medium hover:bg-red-600 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => run(() => onDelete!(branch.id), () => setSelected(current))}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 text-sm pt-1">
                      <button className="text-neutral-500 hover:text-[#113768] dark:hover:text-[#5b9bd5]" onClick={() => startMode("rename")}>
                        Rename
                      </button>
                      <button
                        className="text-neutral-500 hover:text-red-500 disabled:opacity-50 disabled:hover:text-neutral-500"
                        disabled={hasOpenChildren}
                        title={hasOpenChildren ? "Other branches start from this one" : undefined}
                        onClick={() => startMode("delete")}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function NameForm({
  label, value, onChange, busy, submit, onCancel, onSubmit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  submit: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="rounded border border-neutral-300 dark:border-neutral-600 p-3"
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(); }}
    >
      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">{label}</label>
      <input
        autoFocus
        value={value}
        maxLength={80}
        placeholder="Branch name"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
        className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-2.5 py-1.5 text-sm dark:bg-neutral-800 outline-none focus:border-blue-400 mb-2"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" className="px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primary} disabled={busy || !value.trim()}>
          {submit}
        </button>
      </div>
    </form>
  );
}
