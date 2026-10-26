// The history graph: lanes per branch, rows newest first, connectors to the
// branch a row comes from.
const path = require("path");
const OUT = path.join(__dirname, "out");
const { layoutHistory } = require(path.join(OUT, "components/branches/historyLayout.js"));

let failed = 0;
function ok(cond, label) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed++;
}
const t = (min) => new Date(Date.UTC(2026, 9, 14, 12, min)).toISOString();
const branch = (id, name, created, updated, extra = {}) =>
  ({ id, name, parent: null, upstream: false, is_main: false, parent_changed: false, closed_at: null, created_at: t(created), updated_at: t(updated), ...extra });

console.log("\na branch merged back into main");
{
  const history = {
    branches: [
      branch("b", "rev B", 10, 20, { parent: "m" }),
      branch("m", "main", 0, 30, { is_main: true }),
    ],
    merges: [{ source: "b", target: "m", source_name: "rev B", target_name: "main", created_at: t(30) }],
  };
  const { rows, spans, lanes } = layoutHistory(history);
  ok(lanes === 2, "one lane per branch");
  ok(rows.map((r) => r.kind).join(",") === "merge,edit,start,start", "newest first; main's save at the merge is the merge itself");
  ok(rows[0].lane === 0 && rows[0].fromLane === 1, "the merge connects rev B into main");
  ok(rows[0].label === "Merged rev B into main", "merge label");
  const b = rows.find((r) => r.kind === "start" && r.branch === "b");
  ok(b.fromLane === 0 && b.label === "Branched from main", "rev B starts from main");
  const mainSpan = spans.find((s) => s.branch === "m");
  ok(mainSpan.top === 0 && mainSpan.bottom === rows.length - 1, "main's line runs the whole history");
  const bSpan = spans.find((s) => s.branch === "b");
  ok(bSpan.top === 0 && bSpan.topIsCurve, "rev B's line reaches the merge row only where its curve leaves");
  ok(!mainSpan.topIsCurve, "main's line ends at its own dot");
}

console.log("\na fork taking in the original's changes");
{
  const history = {
    branches: [branch("f", "main", 0, 0, { is_main: true, upstream: true })],
    merges: [{ source: "up", target: "f", source_name: "main", target_name: "main", created_at: t(5) }],
  };
  const { rows } = layoutHistory(history, "Big Muff");
  ok(rows[rows.length - 1].label === "Forked from Big Muff", "the fork's start names the original");
  ok(rows[0].label === "Took in changes from Big Muff" && rows[0].fromLane === undefined,
    "the original is not in the graph: no connector");
}

console.log("\nupdating a branch from its parent, and a deleted branch");
{
  const history = {
    branches: [branch("m", "main", 0, 15, { is_main: true }), branch("b", "rev B", 10, 25, { parent: "m" })],
    merges: [
      { source: "m", target: "b", source_name: "main", target_name: "rev B", created_at: t(20) },
      { source: null, target: "m", source_name: "gone", target_name: "main", created_at: t(5) },
    ],
  };
  const { rows } = layoutHistory(history);
  ok(rows.some((r) => r.label === "Updated from main" && r.fromLane === 0 && r.lane === 1), "update from parent");
  ok(rows.some((r) => r.label === "Merged gone into main" && r.fromLane === undefined), "deleted source keeps its name");
}

console.log(failed === 0 ? "\nall passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
