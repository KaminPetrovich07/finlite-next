// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatements, validateEntry, cashFlowAllocation, entriesForAccounts, closingEntryLines } from "./engine";
import { demoEntries, DEMO_PERIOD, DEMO_COMPANY } from "./demo";
import { bankTxToLines, counterAccountFor } from "./posting";
import { computeTaxAccrual, monthsInPeriod } from "./taxes";
import { ACCOUNTS, getAccount, isPostable } from "./accounts";
import { calculate, compareRegimes, REGIME_INFO } from "@/lib/tax-engine";
import { equityKey } from "@/lib/equity";
import type { LedgerEntry } from "./types";

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} ${a} ≠ ${b}`);
const opts = { regime: DEMO_COMPANY.regime };
const JULY = { from: "2026-07-01", to: "2026-07-31" };

test("chart of accounts: codes are unique, postable accounts are mapped", () => {
  const codes = ACCOUNTS.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate codes");
  for (const a of ACCOUNTS.filter((x) => !x.header)) {
    if (a.type === "income" || a.type === "expense") assert.ok(a.pl, `${a.code} has no P&L line`);
    else assert.ok(a.bsRow, `${a.code} has no balance row`);
    assert.ok(a.cf, `${a.code} has no cash-flow role`);
  }
  for (const c of ["1110", "1210", "1410", "2140", "2194", "3110", "3410", "5300", "5999", "6110", "7000", "8010", "9510", "9910"]) {
    assert.ok(isPostable(c), `${c} must be postable`);
  }
  for (const c of ["1100", "2100", "6100", "8000", "9900"]) assert.ok(!isPostable(c), `${c} is a group header`);
  assert.equal(getAccount("2194")?.contra, true);
});

test("demo: every cross-statement check is green for the quarter and each month", () => {
  const entries = demoEntries();
  for (const p of [DEMO_PERIOD, JULY, { from: "2026-08-01", to: "2026-08-31" }, { from: "2026-09-01", to: "2026-09-30" }]) {
    const s = buildStatements(entries, p, opts);
    const failing = s.checks.filter((c) => c.status !== "ok");
    assert.deepEqual(failing, [], `${p.from}: ${JSON.stringify(failing, null, 2)}`);
  }
});

test("demo: income statement and unified tax for Q3", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, opts);
  const is = s.incomeStatement;
  near(is.netRevenue, 7_150_000, "revenue");
  near(is.byLine.cogs, 3_890_000 + 960_000 + 21_600 + 294_000 + 125_600, "cogs = 7000 + wages + social + depreciation + energy");
  near(s.taxes.cashRevenue, 1_160_000, "cash revenue");
  // ст. 423 ч.1 п.2: 4% наличные + 2% безналичные
  near(s.taxes.computed!.total, 1_160_000 * 0.04 + 5_990_000 * 0.02, "unified tax");
  near(is.incomeTax, 166_200, "tax in P&L (three monthly accruals)");
  near(is.netProfit, is.ebt - 166_200, "net");
  near(is.byNature.payroll!, 960_000 + 425_000, "payroll by nature");
});

test("demo: balance sheet links to cash flow and equity", () => {
  const s = buildStatements(demoEntries(), DEMO_PERIOD, opts);
  const bs = s.balanceSheet;
  near(bs.opening[299], bs.opening[599], "opening balanced");
  near(s.cashFlow.values[720], bs.opening[110] + bs.opening[120], "cf opening = bs opening cash");
  near(s.cashFlow.values[710], bs.closing[110] + bs.closing[120], "cf closing = bs closing cash");
  near(bs.closing[530], bs.opening[530] - 500_000 - 150_000 + s.incomeStatement.netProfit, "retained earnings");
  near(s.equity.values[equityKey(90, 2)], -500_000, "dividends row");
  near(s.equity.values[equityKey(110, 1)], 150_000, "reserve transfer, other capital");
  near(s.equity.values[equityKey(110, 2)], -150_000, "reserve transfer, retained earnings");
});

test("cash flow: internal transfer is excluded, mixed entry is split by counterpart", () => {
  const entries = demoEntries();
  const s = buildStatements(entries, DEMO_PERIOD, opts);
  const cf = s.cashFlow.values;
  near(cf[480], 450_000, "loan principal");
  near(cf[70], 90_000, "interest 3 × 30 000");
  near(cf[470], 500_000, "dividends paid");
  near(cf[280], 640_000, "fixed assets bought");
  near(cf[90], 480_000, "income tax paid");
  near(cf[10], 7_150_000 - 2_080_000 + 2_310_000 + 600_000, "receipts from customers");
  const transfer = entries.find((e) => e.description.startsWith("Инкассация"))!;
  assert.deepEqual(cashFlowAllocation(transfer), []);
});

test("period boundary: next month opens with last month's closing balances", () => {
  const entries = demoEntries();
  const q = buildStatements(entries, DEMO_PERIOD, opts);
  const oct = buildStatements(entries, { from: "2026-10-01", to: "2026-10-31" }, opts);
  for (const row of [110, 120, 140, 160, 210, 299, 310, 340, 530, 541, 599]) {
    near(oct.balanceSheet.opening[row] ?? 0, q.balanceSheet.closing[row] ?? 0, `row ${row}`);
  }
  near(oct.incomeStatement.netProfit, 0, "no October activity");
  near(oct.equity.values[equityKey(10, 3)], q.equity.values[equityKey(120, 3)], "equity carried forward");
  assert.equal(oct.checks.filter((c) => c.status === "error").length, 0);
});

test("closing entry: P&L moves to 5300, statements unchanged", () => {
  const entries = demoEntries();
  const before = buildStatements(entries, DEMO_PERIOD, opts);
  const lines = closingEntryLines(entries, DEMO_PERIOD);
  near(lines.reduce((s, l) => s + l.debit - l.credit, 0), 0, "closing entry balanced");
  const closed: LedgerEntry[] = [...entries, { id: "close", date: "2026-09-30", description: "Закрытие", source: "closing", lines }];
  const after = buildStatements(closed, DEMO_PERIOD, opts);
  near(after.incomeStatement.netProfit, before.incomeStatement.netProfit, "P&L unaffected");
  near(after.balanceSheet.closing[530], before.balanceSheet.closing[530], "retained earnings same");
  assert.deepEqual(after.checks.filter((c) => c.status !== "ok"), []);
  const oct = buildStatements(closed, { from: "2026-10-01", to: "2026-10-31" }, opts);
  const pl = oct.trialBalance.rows.filter((r) => getAccount(r.account)?.pl);
  assert.ok(pl.every((r) => r.openingDr === 0 && r.openingCr === 0), "P&L accounts start October at zero");
});

test("unbalanced data and header accounts are caught", () => {
  const broken: LedgerEntry[] = [
    ...demoEntries(),
    { id: "bad", date: "2026-07-15", description: "ошибка", source: "manual", lines: [{ account: "1210", debit: 100, credit: 0 }] },
  ];
  const s = buildStatements(broken, DEMO_PERIOD, opts);
  assert.equal(s.checks.find((c) => c.id === "entries")!.status, "error");
  assert.equal(s.checks.find((c) => c.id === "bs")!.status, "error");
  assert.ok(validateEntry({ date: "2026-07-01", lines: [{ account: "1200", debit: 10, credit: 0 }, { account: "6110", debit: 0, credit: 10 }] }).some((e) => e.includes("групповой")));
});

test("missing tax accrual is flagged", () => {
  const noTax = demoEntries().filter((e) => e.source !== "tax");
  const s = buildStatements(noTax, JULY, opts);
  const c = s.checks.find((c) => c.id === "tax")!;
  assert.equal(c.status, "warn");
  near(c.right!.value, 380_000 * 0.04 + 1_820_000 * 0.02);
});

test("validateEntry", () => {
  assert.deepEqual(validateEntry({ date: "2026-07-01", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6110", debit: 0, credit: 10 }] }), []);
  assert.ok(validateEntry({ date: "2026-07-01", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6110", debit: 0, credit: 9 }] }).length > 0);
  assert.ok(validateEntry({ date: "2026-07-01", lines: [{ account: "9999", debit: 10, credit: 0 }, { account: "6110", debit: 0, credit: 10 }] }).length > 0);
  assert.ok(validateEntry({ date: "01.07.2026", lines: [{ account: "1210", debit: 10, credit: 0 }, { account: "6110", debit: 0, credit: 10 }] }).length > 0);
});

test("bank posting: categories, VAT split, suspense", () => {
  const sale = bankTxToLines({ amount: 112_000, description: "Оплата по счёту 15", category: "Выручка от продаж" }, "general");
  near(sale.find((l) => l.account === "6110")!.credit, 100_000);
  near(sale.find((l) => l.account === "3430")!.credit, 12_000);
  const saleUnified = bankTxToLines({ amount: 112_000, description: "Оплата", category: "Выручка от продаж" }, "unified_trade_l");
  assert.equal(saleUnified.find((l) => l.account === "3430"), undefined);
  assert.equal(counterAccountFor({ amount: -5000, description: "Уплата НДС за июнь", category: "Налоги и сборы" }), "3430");
  assert.equal(counterAccountFor({ amount: -5000, description: "Взносы в Соцфонд", category: "Налоги и сборы" }), "3530");
  assert.equal(counterAccountFor({ amount: -5000, description: "Проценты по кредиту", category: "Кредиты и проценты" }), "9510");
  assert.equal(counterAccountFor({ amount: -5000, description: "Погашение основного долга", category: "Кредиты и проценты" }), "3310");
  assert.equal(counterAccountFor({ amount: 5000, description: "???", category: "Не определено" }), "3600.01");
  assert.equal(counterAccountFor({ amount: -5000, description: "???", category: null }), "1590.01");
  for (const cat of ["Себестоимость / закупка товара", "Зарплата", "Аренда", "Коммунальные услуги", "Реклама и маркетинг"]) {
    assert.ok(isPostable(counterAccountFor({ amount: -1, description: "", category: cat })), cat);
  }
});

test("taxes: rates match the Tax Code", () => {
  const base = { revenueTotal: 1_000_000, cashRevenue: 300_000, ebtBeforeTaxEntry: 200_000, months: 3 };
  // общий режим: налог с продаж 1% и налог на прибыль 10% с прибыли за вычетом налога с продаж
  const g = computeTaxAccrual("general", base, 0);
  near(g.total, 10_000 + (200_000 - 10_000) * 0.1);
  near(computeTaxAccrual("general_services", base, 0).total, 20_000 + (200_000 - 20_000) * 0.1);
  near(computeTaxAccrual("general", { ...base, ebtBeforeTaxEntry: -50_000 }, 0).total, 10_000, "loss → only sales tax");
  near(computeTaxAccrual("unified_services", base, 0).total, 300_000 * 0.06 + 700_000 * 0.04);
  near(computeTaxAccrual("unified_trade_s", base, 0).total, 5_000, "0.5% flat");
  near(computeTaxAccrual("unified_catering_b", base, 0).total, 50_000, "catering Bishkek 5%");
  near(computeTaxAccrual("unified_catering_o", base, 0).total, 30_000, "catering regions 3%");
  near(computeTaxAccrual("unified_textile", base, 0).total, 2_500, "textile 0.25%");
  near(computeTaxAccrual("ecommerce", base, 0).total, 20_000);
  near(computeTaxAccrual("patent", base, 3000).total, 9000);
  assert.equal(monthsInPeriod("2026-07-01", "2026-09-30"), 3);
  assert.equal(monthsInPeriod("2026-01-01", "2026-12-31"), 12);
  for (const k of Object.keys(REGIME_INFO) as Array<keyof typeof REGIME_INFO>) {
    const acc = computeTaxAccrual(k, base, 3000);
    near(acc.entryLines.reduce((s, l) => s + l.debit - l.credit, 0), 0, `${k} entry balanced`);
    for (const l of acc.entryLines) assert.ok(isPostable(l.account), `${k}: ${l.account}`);
  }
});

test("calculator agrees with the ledger accrual", () => {
  const input = {
    revenue: 1_000_000, otherIncome: 0, cogs: 400_000, salaries: 200_000, rent: 50_000, sellingExp: 30_000,
    adminExp: 20_000, otherOpExp: 0, interestExp: 0, otherNonOp: 0, investInc: 0, cashPct: 30, patentAmount: 0,
  };
  const g = calculate({ ...input, regimeKey: "general" });
  near(g.salesTax, 10_000);
  near(g.social, 4_500, "employer 2.25%");
  const ebtBefore = 1_000_000 - 400_000 - 200_000 - 4_500 - 50_000 - 30_000 - 20_000;
  near(g.incomeTax, (ebtBefore - 10_000) * 0.1);
  near(g.incomeTax + g.salesTax, computeTaxAccrual("general", { revenueTotal: 1_000_000, cashRevenue: 0, ebtBeforeTaxEntry: ebtBefore, months: 1 }, 0).total);
  const u = calculate({ ...input, regimeKey: "unified_services" });
  near(u.incomeTax, 300_000 * 0.06 + 700_000 * 0.04);
  assert.ok(compareRegimes(input).every((r) => r.key !== "patent"), "patent skipped without a fee");
});

test("drill-down returns only entries touching the accounts", () => {
  const found = entriesForAccounts(demoEntries(), ["2140"], DEMO_PERIOD);
  assert.equal(found.length, 1);
  assert.match(found[0].description, /станка/);
});

test("fuzz: random balanced journals always reconcile across all statements", () => {
  const codes = ACCOUNTS.filter((a) => !a.header).map((a) => a.code);
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
      const r = rnd();
      entries.push({
        id: `f${run}-${i}`, date: `2026-${String(month).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
        description: "fuzz", source: r < 0.1 ? "opening" : "manual", lines,
      });
    }
    // occasionally close the first half-year, as an accountant would
    if (run % 3 === 0) {
      const h1 = { from: "2026-01-01", to: "2026-06-30" };
      const lines = closingEntryLines(entries, h1);
      if (lines.length) entries.push({ id: `close-${run}`, date: "2026-06-30", description: "закрытие", source: "closing", lines });
    }
    const s = buildStatements(entries, { from: "2026-04-01", to: "2026-09-30" }, { regime: "general" });
    for (const id of ["entries", "tb", "bs", "cf-bs", "eq-bs", "eq-is"]) {
      const c = s.checks.find((c) => c.id === id)!;
      assert.equal(c.status, "ok", `run ${run}: ${id} ${c.detail} ${JSON.stringify([c.left, c.right])}`);
    }
  }
});
