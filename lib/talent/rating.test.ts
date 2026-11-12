// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmedWorkplaces, rating } from "./rating";

test("Реестр: рейтинг по открытой формуле", () => {
  const now = new Date("2026-11-11");
  const base = { experienceYears: 15, certificates: [{ name: "CAP", number: "123" }, { name: "ДипИФР", url: "https://x" }, { name: "1С" }], workplaces: [{ org: "ОсОО «Белес»", position: "Главный бухгалтер" }], education: [{ institution: "КРСУ" }], about: "x".repeat(120), updatedAt: "2026-10-01" };
  const r0 = rating({ ...base, reviews: [] }, now);
  assert.equal(r0.total, 30 + 12.5 + 0 + 10 + 5);
  const five = Array.from({ length: 5 }, () => ({ rating: 5, authorName: "А", authorOrg: "Б" }));
  assert.equal(rating({ ...base, reviews: five }, now).total, 92.5);
  // anonymous reviews do not count
  assert.equal(rating({ ...base, reviews: [{ rating: 1, authorName: "", authorOrg: "" }] }, now).reviewCount, 0);
  assert.deepEqual(confirmedWorkplaces(base.workplaces, [{ authorOrg: "Белес", relation: "employer" }]), [true]);
  assert.deepEqual(confirmedWorkplaces(base.workplaces, [{ authorOrg: "Белес", relation: "colleague" }]), [false]);
});
