// Lays out a project's branches and merges as a graph: one lane (column) per
// branch, one row per event, newest at the top.
import type { BranchMeta, MergeMeta, ProjectHistory } from "@/lib/api";

export type HistoryRowKind = "start" | "edit" | "merge";

export interface HistoryRow {
  key: string;
  kind: HistoryRowKind;
  time: string;
  // The branch the event happened on (a merge: the branch merged into)
  branch: string;
  lane: number;
  // The other end of the connector drawn on this row: the parent a branch
  // started from, or the branch merged in. Undefined when that branch is not
  // in the graph (the original project of a fork, or a deleted branch).
  fromLane?: number;
  label: string;
}

export interface HistorySpan {
  branch: string;
  lane: number;
  // Rows (indexes into rows) the branch's line runs between, top <= bottom
  top: number;
  bottom: number;
  // The top row is only where a curve leaves this line for another branch
  // (no dot of its own): the line stops where the curve starts, half a row lower
  topIsCurve: boolean;
}

export interface HistoryLayout {
  rows: HistoryRow[];
  spans: HistorySpan[];
  lanes: number;
}

// A save that lands within this of a branch's start or of a merge into it
// is that event, not a separate edit
const SAME_EVENT_MS = 2000;

const ms = (t: string) => new Date(t).getTime();

export function layoutHistory(history: ProjectHistory, upstreamName?: string | null): HistoryLayout {
  const main = history.branches.find((b) => b.is_main);
  const others = history.branches.filter((b) => !b.is_main).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const ordered: BranchMeta[] = main ? [main, ...others] : others;
  const lane = new Map(ordered.map((b, i) => [b.id, i]));
  const byId = new Map(ordered.map((b) => [b.id, b]));

  type Event = Omit<HistoryRow, "key" | "lane"> & { lane: number };
  const events: Event[] = [];
  const mergeTimes = new Map<string, number[]>();
  for (const m of history.merges) {
    if (m.target === null || !lane.has(m.target)) continue;
    mergeTimes.set(m.target, [...(mergeTimes.get(m.target) ?? []), ms(m.created_at)]);
  }

  for (const b of ordered) {
    const parent = b.parent ? byId.get(b.parent) : undefined;
    events.push({
      kind: "start",
      time: b.created_at,
      branch: b.id,
      lane: lane.get(b.id)!,
      fromLane: parent ? lane.get(parent.id) : undefined,
      label: b.upstream
        ? `Forked from ${upstreamName ?? "another project"}`
        : parent
          ? `Branched from ${parent.name}`
          : "Project started",
    });
    const edited = ms(b.updated_at);
    const near = [ms(b.created_at), ...(mergeTimes.get(b.id) ?? [])].some((t) => Math.abs(edited - t) < SAME_EVENT_MS);
    if (!near) {
      events.push({ kind: "edit", time: b.updated_at, branch: b.id, lane: lane.get(b.id)!, label: "Last edited" });
    }
  }

  for (const m of history.merges) {
    if (m.target === null || !lane.has(m.target)) continue;
    events.push({
      kind: "merge",
      time: m.created_at,
      branch: m.target,
      lane: lane.get(m.target)!,
      fromLane: m.source !== null ? lane.get(m.source) : undefined,
      label: mergeLabel(m, byId, upstreamName),
    });
  }

  // Newest first; at the same moment a start sits below what follows it
  const order: Record<HistoryRowKind, number> = { edit: 0, merge: 1, start: 2 };
  events.sort((a, b) => ms(b.time) - ms(a.time) || order[a.kind] - order[b.kind]);
  const rows: HistoryRow[] = events.map((e, i) => ({ ...e, key: `${e.kind}-${e.branch}-${i}` }));

  // A branch's line runs from its oldest to its newest row, and reaches every
  // row where another branch connects to it
  const reach = new Map<number, { top: number; bottom: number; topIsCurve: boolean }>();
  const touch = (l: number, row: number, curve: boolean) => {
    const r = reach.get(l);
    if (!r) reach.set(l, { top: row, bottom: row, topIsCurve: curve });
    else {
      // Rows run newest first, so a row reached later is never above the top
      r.bottom = Math.max(r.bottom, row);
      if (row === r.top && !curve) r.topIsCurve = false;
    }
  };
  rows.forEach((r, i) => {
    if (r.fromLane !== undefined && r.fromLane !== r.lane) touch(r.fromLane, i, true);
    touch(r.lane, i, false);
  });
  const spans: HistorySpan[] = ordered
    .filter((b) => reach.has(lane.get(b.id)!))
    .map((b) => ({ branch: b.id, lane: lane.get(b.id)!, ...reach.get(lane.get(b.id)!)! }));

  return { rows, spans, lanes: ordered.length };
}

function mergeLabel(m: MergeMeta, byId: Map<string, BranchMeta>, upstreamName?: string | null): string {
  const source = m.source !== null ? byId.get(m.source) : undefined;
  if (!source && byId.get(m.target!)?.upstream && m.source !== null) {
    return `Took in changes from ${upstreamName ?? "the original"}`;
  }
  const target = byId.get(m.target!);
  if (source && target && target.parent === source.id) return `Updated from ${source.name}`;
  return `Merged ${source?.name ?? m.source_name} into ${target?.name ?? m.target_name}`;
}
