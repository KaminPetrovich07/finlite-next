// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCompanyPeriod, previousPeriod } from "@/lib/ledger/load";
import { BUILDERS } from "./packages";
import { renderPdf } from "./render-pdf";
import { renderDocx } from "./render-docx";
import { renderXlsx } from "./render-xlsx";
import { buildEsgReport, computeEsg, EMPTY_ESG, normalizeEsgInput } from "@/lib/esg";
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

test("ESG: emissions by scope (GHG Protocol, IPCC 2006 factors)", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const input = normalizeEsgInput(DEMO_ESG);
  const rep = computeEsg(d.statements, input);
  assert.ok(Math.abs(rep.emissions.scope2 - (41_800 * 0.153) / 1000) < 0.01, "scope 2 = kWh × grid factor");
  const scope1 = (1_350 * 2.676 + 2_100 * 2.272) / 1000;
  assert.ok(Math.abs(rep.emissions.scope1 - scope1) < 0.01, "scope 1 = litres × IPCC factor");
  assert.ok(rep.emissions.scope3 > 0, "scope 3 commute + travel");
  assert.ok(Math.abs(rep.emissions.scope12 - rep.emissions.scope1 - rep.emissions.scope2) < 1e-9);
  // old saved inputs (petrolL / dieselL) still load
  const legacy = computeEsg(d.statements, normalizeEsgInput({ petrolL: 2_100, dieselL: 1_350, electricityKwh: 41_800 }));
  assert.ok(Math.abs(legacy.emissions.scope1 - scope1) < 0.01);
  const empty = computeEsg(d.statements, EMPTY_ESG);
  assert.equal(empty.emissions.total, 0);
  assert.equal(empty.completeness.filled, 0);
});

test("ESG: economic value adds up (GRI 201-1, accrual basis)", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const e = computeEsg(d.statements, normalizeEsgInput(DEMO_ESG)).economic;
  const sum = e.operatingCosts + e.employees + e.capitalProviders + e.government + e.community;
  assert.ok(Math.abs(e.distributed - sum) < 0.02, "distributed = sum of stakeholders");
  assert.ok(Math.abs(e.generated - e.distributed - e.retained) < 0.02, "retained = generated − distributed");
  const is = d.statements.incomeStatement;
  // retained = net profit + depreciation − dividends declared (500 000 in the demo)
  assert.ok(Math.abs(e.retained - (is.netProfit + (is.byNature.depreciation ?? 0) - 500_000)) < 1, `retained ${e.retained}`);
});

test("ESG report: methodology footnote for every indicator, all sections present", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const doc = buildEsgReport({ company: d.company, period: d.period, statements: d.statements, previous: d.previous, esg: d.esg, prevEsg: null });
  const titles = doc.sections.map((s) => s.title);
  for (const t of ["Резюме", "Ключевые ESG-показатели", "Существенные темы", "Экология", "Социальная сфера", "Управление", "Рекомендации"]) {
    assert.ok(titles.includes(t), t);
  }
  assert.ok(titles.some((t) => t.includes("Указатель стандартов GRI")));
  assert.ok(titles.some((t) => t.includes("IFRS S1 и IFRS S2")));
  const key = doc.sections.find((s) => s.title === "Ключевые ESG-показатели")!;
  for (const b of key.blocks) {
    if (b.type !== "table") continue;
    assert.equal(b.footnotes?.length, b.rows.length, `${b.title}: one footnote per row`);
  }
  const text = JSON.stringify(doc);
  assert.ok(!/\.\.(?!\.)/.test(text.replace(/\.\.\./g, "")), "no doubled periods");
  assert.ok(!text.includes("NaN") && !text.includes("undefined"), "no NaN / undefined in text");
});

test("ESG report without inputs still builds from the ledger", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const doc = buildEsgReport({ company: d.company, period: d.period, statements: d.statements, previous: d.previous, esg: null, prevEsg: null });
  assert.ok(doc.disclaimer);
  assert.ok(!JSON.stringify(doc).includes("NaN"));
  const pdf = await renderPdf(doc);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("ESG report compares with the previous period when it has data", async () => {
  const d = await loadCompanyPeriod("demo", Q3);
  const prevEsg = normalizeEsgInput({ ...DEMO_ESG, electricityKwh: 50_000, vehiclePetrolL: 2_500 });
  // reuse Q3 statements as a stand-in previous period with entries
  const doc = buildEsgReport({ company: d.company, period: d.period, statements: d.statements, previous: d.statements, esg: d.esg, prevEsg });
  const text = JSON.stringify(doc);
  assert.ok(text.includes("снизились на"), "emissions fell vs previous period");
  assert.ok(!text.includes("NaN"));
  const docx = await renderDocx(doc);
  assert.equal(docx.subarray(0, 2).toString(), "PK");
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

test("calculator bridge: ledger P&L reproduces EBT and net profit", async () => {
  const { calcInputFromStatements } = await import("@/lib/ledger/calc-bridge");
  const { calculate } = await import("@/lib/tax-engine");
  const d = await loadCompanyPeriod("demo", Q3);
  const b = calcInputFromStatements(d.statements, d.company.regime!, 0);
  const r = calculate(b.input);
  const is = d.statements.incomeStatement;
  assert.ok(Math.abs(r.ebt - is.ebt) < 0.01, `EBT ${r.ebt} vs ${is.ebt}`);
  assert.ok(Math.abs(r.netProfit - is.netProfit) < 0.01, `net ${r.netProfit} vs ${is.netProfit}`);
  assert.ok(b.skipped.some((x) => x.account === "9910"), "accrued tax is not double counted");
});
