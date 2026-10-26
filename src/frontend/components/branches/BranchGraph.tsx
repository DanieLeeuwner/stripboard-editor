"use client";

import type { ProjectHistory } from "@/lib/api";
import { layoutHistory } from "./historyLayout";

const ROW = 36;
const LANE = 18;
const PAD = 14;

// Lane colours, main first; readable on light and dark backgrounds
const COLORS = ["#2f6db5", "#c2410c", "#15803d", "#7c3aed", "#0e7490", "#b45309", "#be185d"];
export const laneColor = (lane: number) => COLORS[lane % COLORS.length];

export function relativeTime(t: string): string {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return "yesterday";
  return new Date(t).toLocaleDateString();
}

/** The project's history, newest at the top: one coloured line per branch,
 *  a dot per event, and a curve where a branch starts from or merges with
 *  another. Clicking a row selects its branch. */
export default function BranchGraph({
  history,
  upstreamName,
  current,
  selected,
  onSelect,
}: {
  history: ProjectHistory;
  upstreamName?: string | null;
  current: string;
  selected: string;
  onSelect: (branchId: string) => void;
}) {
  const { rows, spans, lanes } = layoutHistory(history, upstreamName);
  const names = new Map(history.branches.map((b) => [b.id, b.name]));
  const x = (lane: number) => PAD + lane * LANE;
  const y = (row: number) => row * ROW + ROW / 2;
  const width = PAD * 2 + Math.max(0, lanes - 1) * LANE;

  return (
    <div className="relative" style={{ height: rows.length * ROW }}>
      {rows.map((r, i) => (
        <button
          key={r.key}
          onClick={() => onSelect(r.branch)}
          className={`absolute left-0 right-0 flex items-center gap-2 pr-3 text-left text-sm rounded transition-colors ${
            r.branch === selected
              ? "bg-[#113768]/10 dark:bg-[#5b9bd5]/15"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
          style={{ top: i * ROW, height: ROW, paddingLeft: width + 6 }}
        >
          <span className="font-medium truncate" style={{ color: laneColor(r.lane) }}>{names.get(r.branch)}</span>
          {i === rows.findIndex((q) => q.branch === current) && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              open
            </span>
          )}
          <span className="text-neutral-600 dark:text-neutral-400 truncate">{r.label}</span>
          <span className="ml-auto flex-shrink-0 text-xs text-neutral-400 dark:text-neutral-500" suppressHydrationWarning>
            {relativeTime(r.time)}
          </span>
        </button>
      ))}
      {/* Drawn over the rows, so a row's hover background never hides it */}
      <svg className="absolute left-0 top-0 pointer-events-none" width={width} height={rows.length * ROW} aria-hidden="true">
        {spans.map((s) => (
          <line
            key={s.branch}
            x1={x(s.lane)} x2={x(s.lane)} y1={y(s.top) + (s.topIsCurve ? ROW / 2 : 0)} y2={y(s.bottom)}
            stroke={laneColor(s.lane)} strokeWidth={s.branch === selected ? 3 : 2} strokeLinecap="round"
          />
        ))}
        {rows.map((r, i) => r.fromLane !== undefined && r.fromLane !== r.lane && (
          <path
            key={`c-${r.key}`}
            // From the other branch's line half a row lower, up into this row's dot
            d={`M ${x(r.fromLane)} ${y(i) + ROW / 2} C ${x(r.fromLane)} ${y(i)}, ${x(r.lane)} ${y(i) + ROW / 2}, ${x(r.lane)} ${y(i)}`}
            fill="none" stroke={laneColor(r.kind === "merge" ? r.fromLane : r.lane)} strokeWidth={2}
          />
        ))}
        {rows.map((r, i) => (
          <circle
            key={`d-${r.key}`}
            cx={x(r.lane)} cy={y(i)} r={r.kind === "edit" ? 4 : 5}
            fill={r.kind === "start" ? "var(--branch-dot-hole, #fff)" : laneColor(r.lane)}
            stroke={laneColor(r.lane)} strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}
