import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries } from "@/lib/ledger/demo";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";
import type { LedgerEntry } from "@/lib/ledger/types";
import { budget, filedKey, quarterOf, taxReports } from "./build";
import { buildTaxReportDoc } from "./doc";

const people = { director: "", directorTitle: "Директор", chief: "", cashier: "", storekeeper: "" };

test("единый налог: квартал, содержащий выбранный месяц; срок 20-го; помесячно для среднего бизнеса", () => {
  const r = taxReports(demoEntries(), { from: "2026-09-01", to: "2026-09-30" }, { regime: "unified_production", size: "medium", today: "2026-10-10" });
  const en = r.reports.find((x) => x.form === "STI-091")!;
  assert.deepEqual(en.period, quarterOf("2026-09-15"));
  assert.equal(en.deadline, "2026-10-20");
  assert.equal(en.status, "due");
  assert.equal(en.posted, en.computed);
  assert.equal(en.months!.length, 3);
  assert.equal(Math.round(en.months!.reduce((s, m) => s + m.lines.at(-1)!.amount!, 0)), Math.round(en.computed));
  const pit = r.reports.find((x) => x.form === "STI-161")!;
  assert.equal(pit.lines[0].amount, 475_000);
  assert.equal(pit.deadline, "2026-10-20");
});

test("общий режим: НсП по кварталу для малого бизнеса, НДС по месяцу до 25-го, ЕНД до 1 апреля; отметка «сдан»", () => {
  const e: LedgerEntry[] = [
    { id: "s", date: "2026-08-10", description: "Продажа", source: "manual", lines: [{ account: "1210", debit: 112_000, credit: 0 }, { account: "6110", debit: 0, credit: 100_000 }, { account: "3430", debit: 0, credit: 12_000 }] },
    { id: "p", date: "2026-08-12", description: "Закупка", source: "manual", lines: [{ account: "1610", debit: 50_000, credit: 0 }, { account: "1540", debit: 6_000, credit: 0 }, { account: "1210", debit: 0, credit: 56_000 }] },
  ];
  const r = taxReports(e, { from: "2026-08-01", to: "2026-08-31" }, { regime: "general", size: "small", today: "2026-09-01", filed: { [filedKey("STI-062", "2026-08-01")]: "2026-09-20" } });
  const vat = r.reports.find((x) => x.form === "STI-062")!;
  assert.equal(vat.deadline, "2026-09-25");
  assert.equal(vat.lines.find((l) => l.code === "050")!.amount, 100_000);
  assert.equal(vat.lines.find((l) => l.code === "066")!.amount, 6_000);
  assert.equal(vat.status, "done");
  const st = r.reports.find((x) => x.form === "STI-129")!;
  assert.equal(st.frequency, "квартал");
  assert.equal(st.lines.find((l) => l.code === "124")!.amount, 100_000);
  assert.equal(st.lines.find((l) => l.code === "131")!.amount, 1_000);
  assert.equal(r.reports.find((x) => x.form === "STI-101")!.deadline, "2027-04-01");
});

test("расчёты с бюджетом и документ", async () => {
  const b = budget(demoEntries(), { from: "2026-09-01", to: "2026-09-30" });
  const en = b.find((x) => x.account === "3410")!;
  assert.equal(en.closing, en.opening + en.accrued - en.paid);
  const r = taxReports(demoEntries(), { from: "2026-07-01", to: "2026-09-30" }, { regime: "unified_production", size: "small", today: "2026-10-31" });
  const doc = buildTaxReportDoc({ name: "ОсОО «Т»", inn: "", people }, r.reports, r.budget, r.regimeName);
  assert.equal((await renderOfficialPdf(doc)).subarray(0, 4).toString(), "%PDF");
});
