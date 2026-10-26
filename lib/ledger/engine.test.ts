// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatements, validateEntry, cashFlowAllocation, entriesForAccounts } from "./engine";
import { demoEntries, DEMO_PERIOD, DEMO_COMPANY } from "./demo";
import { bankTxToLines, counterAccountFor } from "./posting";
import { computeTaxAccrual, monthsInPeriod } from "./taxes";
import { equityKey } from "@/lib/equity";
import type { LedgerEntry } from "./types";

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} ${a} ≠ ${b}`);

test("demo: every cross-statement check is green", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const failing = s.checks.filter((c) => c.status !== "ok");
  assert.deepEqual(failing, [], JSON.stringify(failing, null, 2));
});

test("demo: income statement numbers", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const is = s.incomeStatement;
  near(is.byRole.revenue, 1_400_000, "revenue");
  near(is.byRole.otherIncome, 150_000, "other income");
  near(is.byRole.cogs, 840_000, "cogs");
  // единый налог, производство: касса 400 000 × 4% + безнал 1 150 000 × 2%
  near(s.taxes.computed!.total, 16_000 + 23_000, "unified tax");
  near(is.incomeTax, 39_000, "tax in P&L");
  const expectedEbt = 1_550_000 - 840_000 - 150_000 - 3_375 - 90_000 - 35_000 - 60_000 - 18_000;
  near(is.ebt, expectedEbt, "ebt");
  near(is.netProfit, expectedEbt - 39_000, "net");
});

test("demo: balance sheet links to cash flow and equity", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const bs = s.balanceSheet;
  near(bs.opening[299], 34_980_000, "opening assets");
  near(bs.opening[299], bs.opening[599], "opening balanced");
  near(s.cashFlow.values[720], bs.opening[110] + bs.opening[120], "cf opening = bs opening cash");
  near(s.cashFlow.values[710], bs.closing[110] + bs.closing[120], "cf closing = bs closing cash");
  // retained earnings: 8.5M − 500k dividends − 100k to reserve + net profit
  near(bs.closing[530], 8_500_000 - 500_000 - 100_000 + s.incomeStatement.netProfit, "retained earnings");
  near(s.equity.values[equityKey(90, 2)], -500_000, "dividends row");
  near(s.equity.values[equityKey(110, 1)], 100_000, "reserve transfer, other capital");
  near(s.equity.values[equityKey(110, 2)], -100_000, "reserve transfer, retained earnings");
});

test("cash flow: internal transfer is excluded, mixed entry is split by counterpart", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const cf = s.cashFlow.values;
  near(cf[480], 200_000, "loan principal");
  near(cf[70], 18_000, "interest");
  near(cf[470], 500_000, "dividends paid");
  near(cf[280], 300_000, "fixed assets bought");
  near(cf[90], 480_000, "income tax paid");
  near(cf[10], 450_000 + 250_000 + 600_000 + 900_000, "receipts from customers");
  near(cf[20], 150_000, "other operating receipts");
  const transfer = demoEntries().find((e) => e.description.startsWith("Инкассация"))!;
  assert.deepEqual(cashFlowAllocation(transfer), []);
});

test("period boundary: next month opens with last month's closing balances", () => {
  const entries = demoEntries();
  const july = buildStatements(entries, DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const aug = buildStatements(entries, { from: "2026-08-01", to: "2026-08-31" }, { regime: DEMO_COMPANY.regime });
  for (const row of [110, 120, 140, 160, 210, 299, 310, 340, 530, 541, 599]) {
    near(aug.balanceSheet.opening[row] ?? 0, july.balanceSheet.closing[row] ?? 0, `row ${row}`);
  }
  near(aug.incomeStatement.netProfit, 0, "no August activity");
  near(aug.equity.values[equityKey(10, 3)], july.equity.values[equityKey(120, 3)], "equity carried forward");
  assert.equal(aug.checks.filter((c) => c.status === "error").length, 0);
});

test("unbalanced data is caught", () => {
  const broken: LedgerEntry[] = [
    ...demoEntries(),
    { id: "bad", date: "2026-07-15", description: "ошибка", source: "manual", lines: [{ account: "1210", debit: 100, credit: 0 }] },
  ];
  const s = buildStatements(broken, DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  assert.equal(s.checks.find((c) => c.id === "entries")!.status, "error");
  assert.equal(s.checks.find((c) => c.id === "bs")!.status, "error");
});

test("missing tax accrual is flagged", () => {
  const noTax = demoEntries().filter((e) => e.source !== "tax");
  const s = buildStatements(noTax, DEMO_PERIOD, { regime: DEMO_COMPANY.regime });
  const c = s.checks.find((c) => c.id === "tax")!;
  assert.equal(c.status, "warn");
  near(c.right!.value, 39_000);
});

test("validateEntry", () => {
  assert.deepEqual(validateEntry({ date: "2026-07-01", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6010", debit: 0, credit: 10 }] }), []);
  assert.ok(validateEntry({ date: "2026-07-01", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6010", debit: 0, credit: 9 }] }).length > 0);
  assert.ok(validateEntry({ date: "2026-07-01", lines: [{ account: "9999", debit: 10, credit: 0 }, { account: "6010", debit: 0, credit: 10 }] }).length > 0);
  assert.ok(validateEntry({ date: "01.07.2026", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6010", debit: 0, credit: 10 }] }).length > 0);
});

test("bank posting: categories, VAT split, suspense", () => {
  const sale = bankTxToLines({ amount: 112_000, description: "Оплата по счёту 15", category: "Выручка от продаж" }, "general");
  near(sale.find((l) => l.account === "6010")!.credit, 100_000);
  near(sale.find((l) => l.account === "3430")!.credit, 12_000);
  const saleUnified = bankTxToLines({ amount: 112_000, description: "Оплата", category: "Выручка от продаж" }, "unified_trade_l");
  assert.equal(saleUnified.find((l) => l.account === "3430"), undefined);
  assert.equal(counterAccountFor({ amount: -5000, description: "Уплата НДС за июнь", category: "Налоги и сборы" }), "3430");
  assert.equal(counterAccountFor({ amount: -5000, description: "Взносы в Соцфонд", category: "Налоги и сборы" }), "3530");
  assert.equal(counterAccountFor({ amount: -5000, description: "Проценты по кредиту", category: "Кредиты и проценты" }), "7410");
  assert.equal(counterAccountFor({ amount: -5000, description: "Погашение основного долга", category: "Кредиты и проценты" }), "3310");
  assert.equal(counterAccountFor({ amount: 5000, description: "???", category: "Не определено" }), "3615");
  assert.equal(counterAccountFor({ amount: -5000, description: "???", category: null }), "1595");
});

test("taxes: regimes", () => {
  const base = { revenueTotal: 1_000_000, cashRevenue: 300_000, ebt: 200_000, months: 3 };
  near(computeTaxAccrual("general", base, 0).total, 20_000);
  near(computeTaxAccrual("general", { ...base, ebt: -50_000 }, 0).total, 0);
  near(computeTaxAccrual("simplified", base, 0).total, 20_000);
  near(computeTaxAccrual("unified_services", base, 0).total, 300_000 * 0.06 + 700_000 * 0.04);
  near(computeTaxAccrual("patent", base, 3000).total, 9000);
  assert.equal(monthsInPeriod("2026-07-01", "2026-09-30"), 3);
  assert.equal(monthsInPeriod("2026-01-01", "2026-12-31"), 12);
  const acc = computeTaxAccrual("unified_services", base, 0);
  near(acc.entryLines.reduce((s, l) => s + l.debit - l.credit, 0), 0, "tax entry balanced");
});

test("drill-down returns only entries touching the accounts", () => {
  const found = entriesForAccounts(demoEntries(), ["7410"], DEMO_PERIOD);
  assert.equal(found.length, 1);
  assert.match(found[0].description, /кредита и процентов/);
});

test("fuzz: random balanced journals always reconcile across all statements", async () => {
  const { ACCOUNTS } = await import("./accounts");
  const codes = ACCOUNTS.map((a) => a.code);
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  for (let run = 0; run < 200; run++) {
    const entries: LedgerEntry[] = [];
    const n = 5 + Math.floor(rnd() * 40);
    for (let i = 0; i < n; i++) {
      const legs = 2 + Math.floor(rnd() * 3);
      const lines = [];
      let total = 0;
      for (let k = 0; k < legs - 1; k++) {
        const amt = Math.round(rnd() * 100_000) / 100 + 1;
        total += amt;
        lines.push({ account: pick(codes), debit: amt, credit: 0 });
      }
      lines.push({ account: pick(codes), debit: 0, credit: Math.round(total * 100) / 100 });
      if (rnd() < 0.5) for (const l of lines) [l.debit, l.credit] = [l.credit, l.debit];
      const month = 1 + Math.floor(rnd() * 12);
      entries.push({
        id: `f${run}-${i}`, date: `2026-${String(month).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
        description: "fuzz", source: rnd() < 0.1 ? "opening" : "manual", lines,
      });
    }
    const s = buildStatements(entries, { from: "2026-04-01", to: "2026-09-30" }, { regime: "general" });
    for (const id of ["entries", "tb", "bs", "cf-bs", "eq-bs", "eq-is"]) {
      const c = s.checks.find((c) => c.id === id)!;
      assert.equal(c.status, "ok", `run ${run}: ${id} ${c.detail} ${JSON.stringify([c.left, c.right])}`);
    }
  }
});
