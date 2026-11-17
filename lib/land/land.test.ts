// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { landIssues, landSummary, parcelTax, type Parcel } from "./land";
import { demoParcels } from "./demo";

const base: Parcel = { id: "p1", eni: "E1", name: "Участок", category: "agri", agriType: "irrigated", region: "", district: "", address: "", areaM2: 10_000, purpose: "", right: "own", docKind: "Госакт", docNumber: "1", docDate: "2020-01-01" };

test("земля: налоговая стоимость = площадь × БНС × Ки, налог = стоимость × ставку", () => {
  const t = parcelTax({ ...base, bns: 0.5, ki: 1.2, ratePct: 2 });
  assert.equal(t.taxValue, 6000);
  assert.equal(t.tax, 120);
  assert.deepEqual(t.missing, []);
  assert.deepEqual(parcelTax(base).missing, ["bns", "ki", "rate"]);
  assert.equal(parcelTax({ ...base, bns: 0.5, ki: 1.2 }).tax, null);
  assert.equal(parcelTax({ ...base, exempt: true }).tax, 0);
});

test("земля: проверки — аренда, документ, ЕНИ, параметры налога", () => {
  const list = demoParcels("2026-11-17");
  const texts = landIssues(list, "2026-11-17").map((i) => i.text);
  assert.ok(texts.includes("Аренда «{name}» заканчивается через {n} дн. — продлите договор"));
  assert.ok(texts.includes("У участка «{name}» не указан правоудостоверяющий документ"));
  assert.ok(texts.includes("Для участка «{name}» не заданы параметры налога (БНС, Ки или ставка)"));
  const dup = landIssues([base, { ...base, id: "p2", name: "Второй" }], "2026-11-17");
  assert.ok(dup.some((i) => i.level === "risk" && i.text.startsWith("Код ЕНИ")));
  const ended = landIssues([{ ...base, right: "lease", leaseTo: "2026-10-01" }], "2026-11-17");
  assert.ok(ended.some((i) => i.level === "risk" && i.text.startsWith("Аренда")));
});

test("земля: сводка по категориям в гектарах", () => {
  const s = landSummary(demoParcels("2026-11-17"));
  assert.equal(s.count, 4);
  assert.equal(s.areaHa, 178.63);
  assert.equal(s.byCategory.find((c) => c.category === "agri")!.areaHa, 177);
  assert.equal(s.leaseRentYear, 168000);
  assert.equal(s.taxKnown, false);
});
