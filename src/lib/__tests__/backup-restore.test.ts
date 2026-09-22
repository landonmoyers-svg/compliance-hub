import { diffBackup, restoreMissing, type BackupRecord } from "../backup-restore";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};
const r = (id: string, extra: Record<string, unknown> = {}): BackupRecord => ({ id, createdDate: "2026-01-01", ...extra });

void (async () => {
  const backup = {
    incidents: [r("i1", { name: "A" }), r("i2", { name: "B" }), r("i3", { name: "C", note: null })],
    responses: [r("r1", { incidentId: "i2" })],
    oldModule: [r("x1")],
  };
  const current = {
    incidents: [r("i1", { name: "A" }), r("i3", { name: "C edited" }), r("i4", { name: "new" })],
    responses: [],
  };
  const d = diffBackup(backup, current);
  const by = Object.fromEntries(d.map((x) => [x.name, x]));
  chk("missing incident found", by.incidents.missing.map((x) => x.id), ["i2"]);
  chk("edited record counted, not missing", by.incidents.changed, 1);
  chk("newer records counted", by.incidents.newer, 1);
  chk("unchanged record ignores null vs absent", diffBackup({ a: [r("1", { x: null })] }, { a: [r("1")] })[0].changed, 0);
  chk("dataset gone from app is flagged", by.oldModule.unknown, true);
  chk("missing response found", by.responses.missing.length, 1);

  // Restore: the response depends on its incident, so it fails until the incident is back.
  const db: Record<string, Set<string>> = { incidents: new Set(["i1", "i3", "i4"]), responses: new Set() };
  const parentOf: Record<string, string> = { r1: "i2" };
  const order = d.filter((x) => x.name !== "incidents").concat(d.filter((x) => x.name === "incidents")); // worst case: child first
  const out = await restoreMissing(order, async (name, rows) => {
    const failed: { id: string; error: string }[] = [];
    let inserted = 0;
    for (const row of rows) {
      if (db[name].has(row.id)) failed.push({ id: row.id, error: "duplicate key" });
      else if (parentOf[row.id] && !db.incidents.has(parentOf[row.id])) failed.push({ id: row.id, error: "foreign key" });
      else { db[name].add(row.id); inserted++; }
    }
    return { inserted, failed };
  });
  const o = Object.fromEntries(out.map((x) => [x.name, x]));
  chk("incident restored", o.incidents.inserted, 1);
  chk("child restored on a later pass", o.responses.inserted, 1);
  chk("no failures left", out.reduce((n, x) => n + x.failed.length, 0), 0);
  chk("unknown dataset skipped", "oldModule" in o, false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
