// Портфель: балл риска, согласованность с диагностикой, демо-госпредприятия.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandOf, portfolioRow, summarize, SCORE_TEXTS } from "./score";
import { diagnose } from "@/lib/insolvency/diagnose";
import { taxRisks } from "@/lib/taxrisk/check";
import { validateEntry } from "@/lib/ledger/engine";
import { SOE_PROFILES, soeEntries } from "@/lib/showcase/soe";
import type { LedgerEntry } from "@/lib/ledger/types";

test("границы оценок", () => {
  assert.equal(bandOf(0), "ok"); assert.equal(bandOf(19), "ok"); assert.equal(bandOf(20), "watch"); assert.equal(bandOf(49), "watch"); assert.equal(bandOf(50), "risk");
});

test("демо-госпредприятия: проводки сходятся, три устойчивых, три в зоне внимания, три в высоком риске", () => {
  const rows = SOE_PROFILES.map((p, i) => {
    const es: LedgerEntry[] = soeEntries(p).map((e, j) => ({ id: `s${i}-${j}`, ...e }));
    for (const e of es) assert.deepEqual(validateEntry({ date: e.date, lines: e.lines }), [], `${p.name} ${e.date} ${e.description}`);
    const d = diagnose(es, "2026-11-16", { months: 6 });
    const r = portfolioRow({ id: `c${i}`, name: p.name }, d, taxRisks(es, "2026-06-01", "2026-11-16", { today: "2026-11-16" }), es.length);
    for (const part of r.parts) assert.ok(SCORE_TEXTS.includes(part.label));
    const rank = { ok: 0, watch: 1, risk: 2 } as const;
    assert.ok(rank[r.band] >= rank[d.verdict.level], `${p.name}: портфель мягче диагностики`);
    return r;
  });
  const by = (b: string) => rows.filter((r) => r.band === b).map((r) => r.name);
  assert.ok(by("ok").length >= 3 && by("watch").length >= 3 && by("risk").length >= 3, JSON.stringify({ ok: by("ok"), watch: by("watch"), risk: by("risk") }));
  const s = summarize(rows);
  assert.equal(s.companies, 10);
  assert.equal(s.ok + s.watch + s.risk, 10);
  assert.ok(s.overdue > 0 && s.overdueBudget > 0);
});
