// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatements } from "./engine";
import { demoEntries, DEMO_COMPANY } from "./demo";
import { accountLabel, buildIfrs, ifrsCoverage, ifrsLine, ifrsName, ifrsPickerGroups } from "./ifrs";
import { ACCOUNTS } from "./accounts";

const opts = { regime: DEMO_COMPANY.regime };

test("МСФО: у каждого счёта есть статья, названия не повторяются", () => {
  const { missing, duplicates } = ifrsCoverage();
  assert.deepEqual(missing, [], `нет статьи: ${missing.join(", ")}`);
  assert.deepEqual(duplicates, [], `одинаковые названия: ${duplicates.join("; ")}`);
  const picked = ifrsPickerGroups().flatMap((g) => g.accounts.map((a) => a.code));
  for (const a of ACCOUNTS.filter((x) => !x.header && x.code !== "5999")) assert.ok(picked.includes(a.code), `${a.code} нет в выборе`);
});

test("МСФО: названия и строки отчётов", () => {
  assert.equal(ifrsName("6110"), "Выручка от реализации товаров и услуг");
  assert.equal(accountLabel("6110", "ifrs"), "Выручка от реализации товаров и услуг");
  assert.match(accountLabel("6110", "codes"), /^6110 /);
  assert.equal(ifrsLine("1491"), "tradeRecv");
  assert.equal(ifrsLine("9820"), "otherExpense"); // IAS 1.87: чрезвычайных статей нет
  assert.equal(ifrsLine("1900"), "unpaidCapital");
  assert.equal(ifrsLine("9510"), "financeCosts");
});

test("МСФО: отчётность демо-компании сходится", () => {
  const entries = demoEntries();
  const q3 = buildStatements(entries, { from: "2026-07-01", to: "2026-09-30" }, opts);
  const q2 = buildStatements(entries, { from: "2026-04-01", to: "2026-06-30" }, opts);
  const r = buildIfrs(q3, q2, entries);
  for (const c of r.checks.slice(0, 3)) assert.ok(c.ok, `${c.title}: ${c.detail}`);
  const net = r.pl.find((x) => x.key === "net")!.current;
  assert.ok(Math.abs(net - q3.incomeStatement.netProfit) < 0.01, `прибыль ${net} ≠ ${q3.incomeStatement.netProfit}`);
  const assets = r.sfp.find((x) => x.key === "t-assets")!;
  const eqLiab = r.sfp.find((x) => x.key === "t-eqliab")!;
  assert.ok(Math.abs(assets.current - eqLiab.current) < 0.01);
  assert.ok(Math.abs(assets.previous - eqLiab.previous) < 0.01, "сравнительные данные тоже сходятся");
  // каждая строка раскрывается до статей, и сумма статей равна строке
  for (const row of r.sfp.filter((x) => x.kind === "line")) {
    const parts = r.breakdown[row.key] ?? [];
    const s = parts.reduce((a, p) => a + p.current, 0);
    assert.ok(Math.abs(s - row.current) < 0.01, `${row.label}: ${s} ≠ ${row.current}`);
  }
});
