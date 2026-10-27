// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCompanyPeriod, previousPeriod } from "@/lib/ledger/load";
import { BUILDERS } from "./packages";
import { renderPdf } from "./render-pdf";
import { renderDocx } from "./render-docx";
import { renderXlsx } from "./render-xlsx";
import { computeEsg, EMPTY_ESG } from "@/lib/esg";
import { payrollLines } from "@/lib/ledger/payroll";
import { DEMO_ESG } from "@/lib/ledger/demo";


const Q3 = { from: "2026-07-01", to: "2026-09-30" };

test("previous period of equal length", () => {
  assert.deepEqual(previousPeriod(Q3), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(previousPeriod({ from: "2026-03-01", to: "2026-03-31" }), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(previousPeriod({ from: "2026-01-01", to: "2026-12-31" }), { from: "2025-01-01", to: "2025-12-31" });
  assert.deepEqual(previousPeriod({ from: "2026-07-10", to: "2026-07-19" }), { from: "2026-06-30", to: "2026-07-09" });
});

test("every package renders in every format", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  for (const [key, build] of Object.entries(BUILDERS)) {
    const doc = build(d);
    assert.ok(doc.sections.length > 0, key);
    const pdf = await renderPdf(doc);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF", `${key} pdf`);
    const docx = await renderDocx(doc);
    assert.equal(docx.subarray(0, 2).toString(), "PK", `${key} docx`);
    const xlsx = await renderXlsx(doc);
    assert.equal(xlsx.subarray(0, 2).toString(), "PK", `${key} xlsx`);
  }
});

test("full package carries the same totals as the statements", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const doc = BUILDERS.full(d);
  const bs = doc.sections[0].blocks.find((b) => b.type === "table");
  assert.ok(bs && bs.type === "table");
  const total = bs.rows.find((r) => r.cells[0] === "299");
  assert.equal(total?.cells[3], d.statements.balanceSheet.closing[299]);
});

test("ESG: emissions and economic value", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const rep = computeEsg(d.statements, { ...EMPTY_ESG, ...DEMO_ESG });
  assert.ok(Math.abs(rep.emissions.scope2 - (41_800 * 0.153) / 1000) < 0.01);
  assert.ok(Math.abs(rep.emissions.scope1 - (1_350 * 2.68 + 2_100 * 2.31) / 1000) < 0.01);
  const e = rep.economic;
  const is = d.statements.incomeStatement;
  // retained = net profit + depreciation − dividends paid
  assert.ok(Math.abs(e.retained - (is.netProfit + (is.byNature.depreciation ?? 0) - (d.statements.cashFlow.values[470] ?? 0))) < 0.02);
  const empty = computeEsg(d.statements, EMPTY_ESG);
  assert.equal(empty.emissions.total, 0);
  assert.equal(empty.completeness.filled, 0);
});

test("payroll entry: withholdings and employer contributions", () => {
  const p = payrollLines({ production: 100_000, admin: 50_000 });
  assert.equal(p.gross, 150_000);
  assert.equal(p.employeeSocial, 15_000);
  assert.equal(p.pit, 13_500);
  assert.equal(p.employerSocial, 3_375);
  assert.equal(p.net, 121_500);
  const bal = p.lines.reduce((s, l) => s + l.debit - l.credit, 0);
  assert.ok(Math.abs(bal) < 0.005, "balanced");
});
