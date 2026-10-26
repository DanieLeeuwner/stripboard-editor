// Three-way merge of two branches: what is taken from where, what is a
// conflict, and how the board choice works.
const path = require("path");
const OUT = path.join(__dirname, "out");
const { mergeProjects } = require(path.join(OUT, "components/branches/merge.js"));

let failed = 0;
function ok(cond, label) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed++;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const part = (id, label, extra = {}) => ({
  id, defId: "def-resistor", label, value: "10k", schematicPos: { x: 100, y: 100 }, schematicRotation: 0,
  boardPos: { row: 1, col: 1 }, rotation: 0, ...extra,
});
const base = {
  version: 4, name: "P", notes: "", wiring: "touch",
  componentDefs: [{ id: "def-resistor", name: "Resistor" }],
  components: [part("r1", "R1"), part("r2", "R2", { boardPos: { row: 3, col: 1 } })],
  nets: [], netAssignments: [], schematicWires: [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 0, y: 40 } }], netLabels: [],
  board: { rows: 10, cols: 10, cuts: [{ row: 2, col: 2 }], wires: [{ id: "bw1", from: { row: 0, col: 0 }, to: { row: 0, col: 4 } }] },
};
const names = { target: "main", source: "rev B" };
const merge = (t, s, choices = {}) => mergeProjects(base, t, s, choices, names);
const comp = (r, id) => r.data.components.find((c) => c.id === id);

console.log("\nchanges on different things are both taken");
{
  const t = clone(base); t.components[0].value = "22k";
  const s = clone(base); s.components.push(part("r3", "R3", { boardPos: null }));
  s.schematicWires.push({ id: "w2", start: { x: 0, y: 40 }, end: { x: 40, y: 40 } });
  const r = merge(t, s);
  ok(r.conflicts.length === 0, "no conflicts");
  ok(comp(r, "r1").value === "22k" && !!comp(r, "r3"), "R1's new value and the new R3");
  ok(r.data.schematicWires.length === 2, "the new wire");
  ok(r.changes.some((l) => l === "Parts added: R3"), "the summary names what comes in");
}

console.log("\nthe same field changed differently is a conflict");
{
  const t = clone(base); t.components[0].value = "22k";
  const s = clone(base); s.components[0].value = "47k"; s.components[0].schematicPos = { x: 200, y: 100 };
  const r = merge(t, s);
  ok(r.conflicts.length === 1 && r.conflicts[0].id === "component:r1", "one conflict on R1");
  ok(comp(r, "r1").value === "22k" && comp(r, "r1").schematicPos.x === 200, "unresolved keeps main's value; the move is merged");
  const r2 = merge(t, s, { items: { "component:r1": "source" } });
  ok(comp(r2, "r1").value === "47k", "choosing rev B takes its value");
}

console.log("\ndeleted on one side, changed on the other");
{
  const t = clone(base); t.components = t.components.filter((c) => c.id !== "r1");
  const s = clone(base); s.components[0].value = "47k";
  const r = merge(t, s);
  ok(r.conflicts[0]?.deletedOn === "target", "a conflict naming who deleted it");
  ok(!comp(r, "r1"), "by default main's delete stands");
  ok(comp(merge(t, s, { items: { "component:r1": "source" } }), "r1")?.value === "47k", "or rev B's part is kept");
  const untouched = clone(base);
  ok(!comp(merge(t, untouched), "r1") && merge(t, untouched).conflicts.length === 0, "deleted against untouched: deleted");
}

console.log("\nthe board changed on one side only");
{
  const t = clone(base);
  const s = clone(base); s.components[0].boardPos = { row: 5, col: 5 }; s.board.cuts.push({ row: 6, col: 6 });
  const r = merge(t, s);
  ok(!r.boardChangedOnBoth, "no board question");
  ok(comp(r, "r1").boardPos.row === 5 && r.data.board.cuts.length === 2, "rev B's board work comes in");
}

console.log("\nthe board changed on both sides");
{
  const t = clone(base); t.components[0].boardPos = { row: 4, col: 4 };
  const s = clone(base); s.components[1].boardPos = { row: 7, col: 7 }; s.board.cuts = [];
  s.components.push(part("r3", "R3", { boardPos: { row: 8, col: 8 } }));
  const combined = merge(t, s);
  ok(combined.boardChangedOnBoth && combined.conflicts.length === 0, "asked, and combining has no conflicts");
  ok(comp(combined, "r1").boardPos.row === 4 && comp(combined, "r2").boardPos.row === 7, "both moves");
  ok(combined.data.board.cuts.length === 0, "rev B's removed cut is gone");
  const keep = merge(t, s, { board: "target" });
  ok(comp(keep, "r1").boardPos.row === 4 && comp(keep, "r2").boardPos.row === 3, "main's board as it was");
  ok(keep.data.board.cuts.length === 1, "with main's cuts");
  ok(comp(keep, "r3").boardPos === null, "rev B's new part arrives unplaced");
  const take = merge(t, s, { board: "source" });
  ok(comp(take, "r1").boardPos.row === 1 && comp(take, "r2").boardPos.row === 7 && comp(take, "r3").boardPos.row === 8,
    "rev B's board");
}

console.log("\nthe same part placed differently on both");
{
  const t = clone(base); t.components[0].boardPos = { row: 4, col: 4 };
  const s = clone(base); s.components[0].boardPos = { row: 6, col: 6 };
  const r = merge(t, s);
  ok(r.conflicts.length === 1 && r.conflicts[0].id === "component-board:r1" && r.conflicts[0].area === "board", "a board conflict");
  ok(comp(merge(t, s, { items: { "component-board:r1": "source" } }), "r1").boardPos.row === 6, "resolved to rev B");
}

console.log("\nboard wires are matched by where they run");
{
  const t = clone(base); t.board.wires = [{ id: "new-id-a", from: { row: 0, col: 4 }, to: { row: 0, col: 0 } }];
  const s = clone(base); s.board.wires = [{ id: "new-id-b", from: { row: 0, col: 0 }, to: { row: 0, col: 4 } }];
  ok(merge(t, s).data.board.wires.length === 1, "the same wire with new ids is one wire");
}

console.log("\nsettings and part types");
{
  const t = clone(base); t.notes = "main notes";
  const s = clone(base); s.notes = "rev B notes"; s.partSpacing = 0;
  const r = merge(t, s);
  ok(r.conflicts.length === 1 && r.conflicts[0].id === "setting:notes" && r.conflicts[0].label === "Notes", "notes conflict");
  ok(r.data.partSpacing === 0, "a one-sided setting comes in");

  const custom = { id: "custom-1", name: "Relay" };
  const b2 = clone(base); b2.componentDefs.push(custom);
  const t2 = clone(b2); t2.componentDefs = t2.componentDefs.filter((d) => d.id !== "custom-1");
  const s2 = clone(b2); s2.components.push(part("k1", "K1", { defId: "custom-1", boardPos: null }));
  const r2 = mergeProjects(b2, t2, s2, {}, names);
  ok(r2.data.componentDefs.some((d) => d.id === "custom-1") && r2.data.components.some((c) => c.id === "k1"),
    "a part type deleted on main comes back for rev B's new part");
}

console.log("\nbuilt-in part types are not stored with a project");
{
  const b3 = clone(base); b3.componentDefs = [];
  const t3 = clone(b3); t3.components[0].value = "1k";
  const s3 = clone(b3); s3.components.push(part("r3", "R3", { boardPos: null }));
  const r3 = mergeProjects(b3, t3, s3, {}, names);
  ok(r3.data.components.length === 3, "parts of built-in types are all kept");
}

console.log("\nchanges the summary used to miss still count");
{
  const same = merge(clone(base), clone(base));
  ok(!same.changesTarget, "nothing changed: nothing to merge");
  const b4 = clone(base); b4.nets = [{ id: "n1", name: "DIS", color: "#00f" }];
  const t4 = clone(b4);
  const s4 = clone(b4); s4.nets[0].name = "DISCHARGE";
  const r4 = mergeProjects(b4, t4, s4, {}, names);
  ok(r4.changesTarget && r4.changes.some((l) => l.includes("DIS to DISCHARGE")), "a net rename alone");
  const s5 = clone(base); s5.board.lockedRows = true;
  const r5 = merge(clone(base), s5);
  ok(r5.changesTarget && r5.changes.includes("Board size locks changed"), "a board lock alone");
  const t6 = clone(base); t6.board.cuts.push({ row: 2, col: 2 });
  ok(!merge(t6, clone(base)).changesTarget, "a cut saved twice is no change");
}

console.log(failed === 0 ? "\nall passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
