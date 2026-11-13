// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { benford, BENFORD, findAnomalies } from "./anomalies";
import { demoEntries } from "@/lib/ledger/demo";
import type { LedgerEntry } from "@/lib/ledger/types";

const E = (id: string, date: string, amount: number, dr: string, cr: string, party?: string, source: LedgerEntry["source"] = "manual"): LedgerEntry =>
  ({ id, date, description: `Операция ${id}`, source, lines: [{ account: dr, debit: amount, credit: 0, party }, { account: cr, debit: 0, credit: amount }] });

test("аномалии: дубль, крупная сумма, выходной, сторно выручки", () => {
  const base: LedgerEntry[] = [];
  for (let i = 1; i <= 8; i++) base.push(E(`r${i}`, `2026-09-0${i < 10 ? i : 9}`, 9000 + i * 100, "8030", "3110", "ИП Асанов"));
  const es = [...base,
    E("d1", "2026-10-05", 45000, "3110", "1210", "ОсОО «Плита Импорт»"), E("d2", "2026-10-07", 45000, "3110", "1210", "ОсОО «Плита Импорт»"),
    E("big", "2026-10-15", 900000, "8030", "3110", "ИП Асанов"),
    E("sat", "2026-10-10", 3000, "8040", "1210"),
    E("cash-sat", "2026-10-17", 3000, "1110", "6110"),
    E("back", "2026-10-20", 12000, "6110", "1410", "ОсОО «Ала-Тоо Отель»"),
    E("hol", "2026-08-31", 500, "8040", "1210"),
  ];
  const r = findAnomalies(es, "2026-10-01", "2026-10-31", ["2026-08-31"]);
  const kinds = r.findings.map((f) => `${f.kind}:${f.entryIds.join("+")}`);
  assert.ok(kinds.includes("duplicate:d1+d2"), kinds.join(" "));
  assert.ok(kinds.includes("outlier:big"));
  assert.ok(kinds.includes("weekend:sat"));
  assert.ok(!kinds.includes("weekend:cash-sat"), "наличная торговля в субботу — обычное дело");
  assert.ok(kinds.includes("revenue-reversal:back"));
  assert.ok(!kinds.some((k) => k.includes("hol")), "вне периода не проверяется");
  assert.equal(r.findings[0].severity, "high");
  assert.equal(r.checked, 6);
  const h = findAnomalies(es, "2026-08-01", "2026-08-31", ["2026-08-31"]);
  assert.equal(h.findings.find((f) => f.entryIds.includes("hol"))?.title, "Банковская операция в праздник");
});

test("аномалии: на демо-компании нет ложных дублей и сторно", () => {
  const r = findAnomalies(demoEntries() as LedgerEntry[], "2026-07-01", "2026-09-30");
  assert.equal(r.findings.filter((f) => f.kind === "duplicate").length, 0, r.findings.filter((f) => f.kind === "duplicate").map((f) => f.detail).join("\n"));
  assert.equal(r.findings.filter((f) => f.kind === "revenue-reversal").length, 0);
});

test("закон Бенфорда: геометрический ряд соответствует, равномерные суммы — нет", () => {
  assert.equal(Math.round(BENFORD[0] * 1000), 301);
  const geo = Array.from({ length: 2000 }, (_, i) => 10 * Math.pow(1.0071, i));
  assert.ok(["close", "acceptable"].includes(benford(geo).verdict), String(benford(geo).mad));
  const flat = Array.from({ length: 900 }, (_, i) => 1000 + (i % 9) * 1000 + 1);
  assert.equal(benford(flat).verdict, "nonconforming");
  assert.equal(benford([100, 200]).verdict, "few");
});
