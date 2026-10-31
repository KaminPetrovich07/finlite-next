import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_PERIOD, DEMO_COMPANY } from "@/lib/ledger/demo";
import { closingEntryLines, validateEntry } from "@/lib/ledger/engine";
import type { LedgerEntry } from "@/lib/ledger/types";
import { analyze } from "@/lib/counterparties/calc";
import { demoStore } from "@/lib/counterparties/demo";
import { calculate, costPools } from "@/lib/costing/calc";
import { DEMO_PRODUCTS, demoOutputs } from "@/lib/costing/demo";
import { closeChecklist, type CloseInput } from "./checklist";

const people = { director: "Асанов А.", directorTitle: "Директор", chief: "Бекова Б.", cashier: "Осмонова Н.", storekeeper: "" };
const rates = { method: "aging" as const, d90: 25, d180: 50, d365: 100 };
function input(entries: LedgerEntry[], from: string, to: string, over: Partial<CloseInput> = {}): CloseInput {
  return {
    entries, period: { from, to }, regime: DEMO_COMPANY.regime, unpostedBankTx: 0, policySaved: true, people,
    cp: analyze(entries, demoStore(), from, to, rates),
    costing: { production: true, result: calculate(DEMO_PRODUCTS, demoOutputs(from, to), costPools(entries, from, to), "labor", "actual"), hasNorms: true, outputsSet: true },
    ...over,
  };
}

test("демо-квартал: ошибок нет, резерв предлагается готовой проводкой, закрытие доступно", () => {
  const r = closeChecklist(input(demoEntries(), DEMO_PERIOD.from, DEMO_PERIOD.to));
  assert.equal(r.errors, 0);
  assert.ok(r.canClose);
  const allowance = r.steps.find((s) => s.id === "allowance")!;
  assert.equal(allowance.status, "warn");
  assert.equal(allowance.action?.kind, "entry");
  if (allowance.action?.kind === "entry") assert.deepEqual(validateEntry(allowance.action.entry), []);
  assert.equal(r.steps.find((s) => s.id === "dep")!.status, "ok");
  assert.equal(r.steps.at(-1)!.id, "close");
});

test("закрытый период распознаётся; минус по складу — ошибка; нет амортизации — замечание", () => {
  const base = demoEntries().filter((e) => !(e.date >= "2026-09-01" && /Амортизация/.test(e.description)));
  const ref = "2026-09-01..2026-09-30";
  const closing: LedgerEntry = { id: "cl", date: "2026-09-30", description: "Закрытие", source: "closing", sourceRef: ref, lines: closingEntryLines(base, { from: "2026-09-01", to: "2026-09-30" }) };
  const minus: LedgerEntry = { id: "neg", date: "2026-09-29", description: "Списание лишнего", source: "manual", lines: [{ account: "1640", debit: 9_000_000, credit: 0 }, { account: "1620", debit: 0, credit: 9_000_000, item: "ЛДСП 16 мм", qty: 3000, unit: "лист" }] };
  const r = closeChecklist(input([...base, minus, closing], "2026-09-01", "2026-09-30", { unpostedBankTx: 3, people: { ...people, cashier: "" } }));
  assert.deepEqual(r.closed, { by: "finlite", date: "2026-09-30" });
  assert.equal(r.steps.find((s) => s.id === "stock")!.status, "error");
  assert.equal(r.canClose, false);
  assert.equal(r.steps.find((s) => s.id === "dep")!.status, "warn");
  assert.equal(r.steps.find((s) => s.id === "bank")!.action?.kind, "bank");
  assert.match(r.steps.find((s) => s.id === "signers")!.detail, /кассир/);
});
