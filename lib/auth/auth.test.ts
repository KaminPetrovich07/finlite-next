import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { newToken, normalizeEmail, sha256 } from "./tokens";
import { allows, canManage, levelFor } from "./access";
import { tooMany } from "./limits";
import { anchorKgsMonth, effectivePlan, PLANS, PRICE_ANCHORS } from "../plans";
import { computeMetrics, weekOf } from "../metrics/compute";
import { reviewOverdue, TAX_RULES, taxParameters } from "../tax-rules";
import { REGIME_INFO } from "../tax-engine";

test("пароль: хеш проверяется, чужой пароль — нет, соль разная", () => {
  const h1 = hashPassword("Bishkek2026");
  const h2 = hashPassword("Bishkek2026");
  assert.notEqual(h1, h2);
  assert.ok(h1.startsWith("scrypt$"));
  assert.ok(verifyPassword("Bishkek2026", h1));
  assert.ok(!verifyPassword("bishkek2026", h1));
  assert.ok(!verifyPassword("Bishkek2026", null));
  assert.ok(!verifyPassword("Bishkek2026", "garbage"));
});

test("пароль: требования", () => {
  assert.equal(passwordProblem("short1"), "Пароль — не короче 8 символов");
  assert.match(passwordProblem("onlyletters")!, /буквы, и цифры/);
  assert.match(passwordProblem("ivanov2026x", "ivanov@mail.kg")!, /e-mail/);
  assert.equal(passwordProblem("Ала-Тоо 2026"), null);
});

test("токены: случайные, хеш стабилен, e-mail нормализуется", () => {
  assert.notEqual(newToken(), newToken());
  assert.ok(newToken().length >= 40);
  assert.equal(sha256("a"), sha256("a"));
  assert.equal(normalizeEmail("  Kamin@Mail.KG "), "kamin@mail.kg");
});

test("доступ: владелец, совместный доступ, админ, чужой, демо", () => {
  const u = { id: "u1", role: "user" };
  const adm = { id: "a", role: "admin" };
  assert.equal(levelFor(u, { ownerId: "u1" }), "owner");
  assert.equal(levelFor(u, { ownerId: "u2", sharedLevel: "edit" }), "edit");
  assert.equal(levelFor(u, { ownerId: "u2", sharedLevel: "view" }), "view");
  assert.equal(levelFor(u, { ownerId: "u2" }), "none");
  assert.equal(levelFor(u, { ownerId: null }), "none");
  assert.equal(levelFor(null, { ownerId: "u1" }), "none");
  assert.equal(levelFor(adm, { ownerId: "u2" }), "owner");
  assert.equal(levelFor(null, { ownerId: null, demo: true }), "view");
  assert.ok(allows("edit", "edit") && allows("view", "view") && !allows("view", "edit") && !allows("none", "view"));
  assert.ok(canManage("owner") && !canManage("edit"));
});

test("ограничение попыток", () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(tooMany("k", 3, 1000, now + i), false);
  assert.equal(tooMany("k", 3, 1000, now + 4), true);
  assert.equal(tooMany("k", 3, 1000, now + 5000), false);
});

test("тарифы: просроченная оплата → бесплатный", () => {
  const now = new Date("2026-11-11T00:00:00Z");
  assert.equal(effectivePlan("pro", "2026-12-01", now).key, "pro");
  assert.equal(effectivePlan("start", "2026-12-01", now).key, "pro"); // старый тариф «Старт» читается как «Про»
  assert.equal(effectivePlan("business", "2026-12-01", now).key, "max");
  assert.equal(effectivePlan("premium", "2026-10-01", now).key, "free");
  assert.equal(effectivePlan("science", null, now).key, "free");
  assert.equal(effectivePlan("business", null, now).key, "free");
  assert.equal(effectivePlan("pilot", null, now).key, "pilot");
  assert.equal(effectivePlan("unknown", null, now).key, "free");
  assert.ok(PLANS.free.companies >= 1);
  // каждый следующий публичный тариф не хуже предыдущего по лимитам
  const ladder = [PLANS.free, PLANS.pro, PLANS.max, PLANS.premium];
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i].companies >= ladder[i - 1].companies);
    assert.ok(ladder[i].priceKgs > ladder[i - 1].priceKgs);
    for (const f of ladder[i - 1].features) assert.ok(ladder[i].features.includes(f), `${ladder[i].key} без ${f}`);
  }
  // учебные тарифы: семестр дешевле пяти месяцев, группа дешевле 30 личных подписок
  assert.ok(PLANS.science.priceSemesterKgs! < PLANS.science.priceKgs * 5);
  assert.ok(PLANS.group.priceSemesterKgs! < PLANS.science.priceSemesterKgs! * 30);
  assert.deepEqual(PLANS.group.features, PLANS.science.features);
  assert.equal(effectivePlan("group", "2027-02-01", now).key, "group");
  // опорные цены: 59 $ × 87,45 × 0,25 ≈ 1 290 сом; 18 100 ₽ в год ≈ 1 607 сом в месяц
  assert.equal(anchorKgsMonth(PRICE_ANCHORS.find((a) => a.product === "Xero" && a.tier === "Growing")!), 1290);
  assert.equal(anchorKgsMonth(PRICE_ANCHORS.find((a) => a.product === "1С:Фреш" && a.tier === "Базовый")!), 1607);
});

test("метрики: DAU/WAU/MAU, когорты, воронка", () => {
  const now = new Date("2026-11-11T09:00:00Z");
  const d = (s: string) => new Date(s);
  const users = [
    { id: "a", createdAt: d("2026-11-02T05:00:00Z") },
    { id: "b", createdAt: d("2026-11-03T05:00:00Z") },
    { id: "c", createdAt: d("2026-11-10T05:00:00Z") },
    { id: "adm", createdAt: d("2026-10-01T05:00:00Z"), role: "admin" },
  ];
  const activity = [
    { userId: "a", at: d("2026-11-11T04:00:00Z"), action: "active_day" },
    { userId: "a", at: d("2026-11-09T04:00:00Z"), action: "export" },
    { userId: "b", at: d("2026-11-05T04:00:00Z"), action: "active_day" },
    { userId: "adm", at: d("2026-11-11T04:00:00Z"), action: "active_day" },
  ];
  const m = computeMetrics({
    now, users, activity,
    companies: [{ ownerId: "a", createdAt: d("2026-11-02T06:00:00Z") }, { ownerId: "b", createdAt: d("2026-11-03T06:00:00Z") }],
    entriesByCompanyOwner: [{ ownerId: "a", count: 25 }, { ownerId: "b", count: 3 }],
  });
  assert.equal(m.users, 3); // admin excluded
  assert.equal(m.dau, 1);
  assert.equal(m.wau, 3); // a (11.11), c (10.11), b (05.11)
  assert.equal(m.mau, 3);
  assert.deepEqual(m.funnel.map((f) => f.users), [3, 2, 1, 1, 1]);
  const w = m.cohorts.find((c) => c.week === weekOf(d("2026-11-02T05:00:00Z")))!;
  assert.equal(w.size, 2);
  assert.equal(w.retention[0], 1);
  assert.equal(w.retention[1], 0.5);
  assert.equal(m.daily.length, 30);
});

test("налоговые правила: версия, сверка, параметры по каждому режиму", () => {
  assert.match(TAX_RULES.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(reviewOverdue(new Date("2026-09-01T00:00:00Z")), false);
  assert.equal(reviewOverdue(new Date("2027-03-01T00:00:00Z")), true);
  const params = taxParameters();
  for (const [k, r] of Object.entries(REGIME_INFO)) {
    assert.ok(r.article, `нет статьи у ${k}`);
    if (r.kind === "unified" || r.kind === "ecommerce") {
      assert.ok(r.rates && r.rates.every((x) => x >= 0 && x <= 0.1), `ставка ${k}`);
      assert.ok(params.some((p) => p.name === r.name), `нет в списке ${k}`);
    }
  }
});
