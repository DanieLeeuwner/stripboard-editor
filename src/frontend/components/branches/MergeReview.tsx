"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import type { BoardChoice, MergeChoices, MergeConflict, MergeOutcome, Side } from "./merge";

/** A merge ready to review: `preview` works out the result for the user's
 *  choices (cheap, run on every change), `commit` saves it. */
export interface MergePlan {
  kind: "from-parent" | "into-parent";
  // The kind as analytics reports it: a fork taking in its original is told apart
  eventKind: string;
  targetName: string;
  sourceName: string;
  preview: (choices: MergeChoices) => MergeOutcome;
  commit: (choices: MergeChoices) => Promise<void>;
}

const AREA_NAMES: Record<MergeConflict["area"], string> = { schematic: "Schematic", board: "Board", settings: "Setting" };

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded border transition-colors ${
        active
          ? "border-[#113768] bg-[#113768] text-white dark:border-[#5b9bd5] dark:bg-[#5b9bd5] dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function MergeReview({ plan, onCancel, onDone }: { plan: MergePlan; onCancel: () => void; onDone: () => void }) {
  const { targetName: tn, sourceName: sn } = plan;
  const [board, setBoard] = useState<BoardChoice | undefined>(undefined);
  const [items, setItems] = useState<Record<string, Side>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcome = plan.preview({ board: board ?? "combine", items });
  const { conflicts, changes, boardChangedOnBoth, changesTarget } = outcome;
  const undecided = conflicts.filter((c) => !items[c.id]).length + (boardChangedOnBoth && !board ? 1 : 0);
  const nothing = !changesTarget && conflicts.length === 0;
  const title = plan.kind === "into-parent" ? `Merge ${sn} into ${tn}` : `Update ${tn} from ${sn}`;

  const choose = (id: string, side: Side) => setItems((prev) => ({ ...prev, [id]: side }));
  const chooseAll = (side: Side) => setItems((prev) => ({ ...prev, ...Object.fromEntries(conflicts.map((c) => [c.id, side])) }));

  const merge = async () => {
    setBusy(true);
    setError(null);
    try {
      await plan.commit({ board: board ?? "combine", items });
      onDone();
    } catch (e) {
      track("branch-merge-failed", { kind: plan.eventKind });
      setError(e instanceof Error ? e.message : "The merge failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto p-5 space-y-6">
        <div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {plan.kind === "into-parent"
              ? `${tn} takes in what changed on ${sn}. ${sn} is closed afterwards: it stays in the history, but is no longer edited.`
              : `${tn} takes in what changed on ${sn} since they last met. ${sn} itself stays as it is.`}
          </p>
        </div>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
            What {sn} brings in
          </h4>
          {nothing ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Nothing: {tn} already has everything from {sn}.
            </p>
          ) : (
            <ul className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1 list-disc pl-5">
              {changes.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </section>

        {boardChangedOnBoth && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              Both branches changed the board
            </h4>
            <div className="space-y-2 text-sm">
              {([
                ["combine", "Combine both boards", "Every move, cut and wire from both. Check the result in the editor: parts can end up overlapping."],
                ["target", `Keep ${tn}'s board`, `Parts new on ${sn} arrive unplaced.`],
                ["source", `Take ${sn}'s board`, `Parts new on ${tn} become unplaced.`],
              ] as [BoardChoice, string, string][]).map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2.5 cursor-pointer">
                  <input type="radio" name="board" className="mt-1" checked={board === value} onChange={() => setBoard(value)} />
                  <span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {conflicts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Changed on both ({conflicts.length})
              </h4>
              <div className="flex gap-3 text-xs">
                <button className="text-[#113768] dark:text-[#5b9bd5] hover:underline" onClick={() => chooseAll("target")}>All {tn}&apos;s</button>
                <button className="text-[#113768] dark:text-[#5b9bd5] hover:underline" onClick={() => chooseAll("source")}>All {sn}&apos;s</button>
              </div>
            </div>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded">
              {conflicts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-[12rem]">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{c.label}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-400">{AREA_NAMES[c.area]}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">{c.detail}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Choice active={items[c.id] === "target"} onClick={() => choose(c.id, "target")}>
                      {c.deletedOn === "target" ? "Keep it deleted" : `Keep ${tn}'s`}
                    </Choice>
                    <Choice active={items[c.id] === "source"} onClick={() => choose(c.id, "source")}>
                      {c.deletedOn === "source" ? "Delete it" : `Take ${sn}'s`}
                    </Choice>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex items-center gap-3 justify-end px-5 py-3 border-t border-neutral-200 dark:border-neutral-700 flex-shrink-0">
        {error && <p className="text-sm text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        {!error && undecided > 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mr-auto">
            {undecided} {undecided === 1 ? "decision" : "decisions"} left
          </p>
        )}
        <button
          className="px-4 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          onClick={() => {
            track("branch-merge-cancel", { kind: plan.eventKind, how: "back" });
            onCancel();
          }}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm rounded bg-[#113768] text-white font-medium hover:bg-[#0d2a50] disabled:opacity-50"
          disabled={busy || nothing || undecided > 0}
          onClick={merge}
        >
          {busy ? "Merging..." : plan.kind === "into-parent" ? `Merge into ${tn}` : `Update ${tn}`}
        </button>
      </div>
    </div>
  );
}
