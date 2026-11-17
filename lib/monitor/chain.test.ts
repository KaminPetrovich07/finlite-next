// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, GENESIS, newReport, nextRow, rowHash, verifyRows, type ChainRow } from "./chain";

const build = (n: number): ChainRow[] => {
  const rows: ChainRow[] = [];
  let prev: { hash: string; createdAt: Date } | null = null;
  for (let i = 0; i < n; i++) {
    const r = nextRow(prev, { actor: `u${i % 2}`, action: i % 3 ? "entry_update" : "login", companyId: i % 2 ? "c1" : null, details: { i, ip: "10.0.0.1", nested: { b: 2, a: 1 } } }, new Date(Date.UTC(2026, 10, 16, 10, 0, 0)));
    rows.push(r); prev = r;
  }
  return rows;
};
const check = (rows: ChainRow[]) => { const st = { prev: null as string | null, report: newReport() }; verifyRows(rows, st); return st.report; };

test("цепочка журнала: ключи в любом порядке дают один и тот же текст", () => {
  assert.equal(canonical({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), canonical({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
});

test("цепочка журнала: целая проходит, время строго растёт", () => {
  const rows = build(6);
  assert.equal(rows[0].prevHash, GENESIS);
  for (let i = 1; i < rows.length; i++) assert.ok((rows[i].createdAt as Date).getTime() > (rows[i - 1].createdAt as Date).getTime());
  const rep = check(rows);
  assert.equal(rep.checked, 6); assert.deepEqual(rep.breaks, []); assert.ok(rep.startsAtGenesis); assert.equal(rep.head, rows[5].hash);
});

test("цепочка журнала: изменённая запись и удалённая из середины обнаруживаются", () => {
  const rows = build(6);
  const edited = rows.map((r, i) => (i === 2 ? { ...r, details: { ...(r.details as object), ip: "1.2.3.4" } } : r));
  assert.deepEqual(check(edited).breaks.map((b) => [b.id, b.kind]), [[rows[2].id, "changed"]]);
  const reassigned = rows.map((r, i) => (i === 3 ? { ...r, actor: "u9" } : r));
  assert.equal(check(reassigned).breaks[0].kind, "changed");
  const gap = rows.filter((_, i) => i !== 3);
  assert.deepEqual(check(gap).breaks.map((b) => [b.id, b.kind]), [[rows[4].id, "gap"]]);
});

test("цепочка журнала: удаление начала по сроку хранения — не разрыв", () => {
  const rows = build(6).slice(2);
  const rep = check(rows);
  assert.deepEqual(rep.breaks, []); assert.equal(rep.startsAtGenesis, false); assert.equal(rep.checked, 4);
});

test("цепочка журнала: хэш зависит от предыдущего", () => {
  const r = { id: "x", actor: null, action: "a", companyId: null, details: null, createdAt: "2026-11-16T00:00:00.000Z" };
  assert.notEqual(rowHash(GENESIS, r), rowHash("1".repeat(64), r));
});
