// Переход ко входу по паролю: пилот для новых пользователей, передача компаний по e-mail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePlan, PLANS } from "@/lib/plans";
import { endOfDayBishkek, planForNewUser } from "./transition";

test("пилот: тариф новому пользователю до конца дня по Бишкеку, потом — бесплатный", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  assert.equal(endOfDayBishkek("2027-03-31").toISOString(), "2027-03-31T17:59:59.999Z");
  const p = planForNewUser({ until: "2027-03-31" }, now);
  assert.equal(p.plan, "pilot");
  assert.equal(p.paidUntil?.toISOString(), "2027-03-31T17:59:59.999Z");
  assert.match(p.planNote ?? "", /31\.03\.2027/);
  assert.equal(planForNewUser({ until: "2026-11-01" }, now).plan, "free", "пилот закончился");
  assert.equal(planForNewUser({ until: null }, now).plan, "free", "пилота нет");
  // выданный пилот с датой заканчивается сам; без даты — бессрочный
  assert.equal(effectivePlan("pilot", "2027-03-31T17:59:59Z", now).key, "pilot");
  assert.equal(effectivePlan("pilot", "2026-11-01T00:00:00Z", now).key, "free");
  assert.equal(effectivePlan("pilot", null, now).key, "pilot");
  assert.ok(PLANS.pilot.companies >= 20, "бухгалтеру с 20 клиентами хватает пилота");
});

test("database: компании переходят владельцу сразу или при регистрации; ожидание снимается", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { assignOwners, claimPending, pendingOwners, clearPending, pilotSettings, savePilot } = await import("./transition");
  const tag = `t${Date.now()}`;
  const made: string[] = [];
  try {
    const a = await prisma.company.create({ data: { name: `${tag} Торговый дом` } });
    const b = await prisma.company.create({ data: { name: `${tag} Магазин` } });
    const c = await prisma.company.create({ data: { name: `${tag} Кафе` } });
    made.push(a.id, b.id, c.id);
    const existing = await prisma.user.create({ data: { email: `${tag}-old@example.kg`, name: "Есть" } });

    // зарегистрированный — сразу; повтор с тем же e-mail в другом регистре не ломается
    const r1 = await assignOwners([a.id, a.id], ` ${tag}-OLD@example.kg `);
    assert.deepEqual([r1.now, r1.pending], [1, 0]);
    assert.equal((await prisma.company.findUnique({ where: { id: a.id } }))?.ownerId, existing.id);

    // ещё не зарегистрирован — ждёт; несуществующие id отбрасываются
    const r2 = await assignOwners([b.id, c.id, "нет-такой"], `${tag}-new@example.kg`);
    assert.deepEqual([r2.now, r2.pending], [0, 2]);
    assert.equal((await pendingOwners())[b.id], `${tag}-new@example.kg`);

    // владельца одной из них назначили напрямую — ожидание снимается
    await clearPending([c.id]);
    assert.equal((await pendingOwners())[c.id], undefined);

    const fresh = await prisma.user.create({ data: { email: `${tag}-new@example.kg`, name: "Новый" } });
    assert.equal(await claimPending(fresh), 1);
    assert.equal((await prisma.company.findUnique({ where: { id: b.id } }))?.ownerId, fresh.id);
    assert.equal((await pendingOwners())[b.id], undefined);
    assert.equal(await claimPending(fresh), 0, "второй раз нечего забирать");

    await savePilot("2027-03-31");
    assert.deepEqual(await pilotSettings(), { until: "2027-03-31" });
    await savePilot(null);
    assert.deepEqual(await pilotSettings(), { until: null });
  } finally {
    await prisma.activityLog.deleteMany({ where: { user: { email: { startsWith: tag } } } });
    await prisma.company.deleteMany({ where: { id: { in: made } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.appSetting.deleteMany({ where: { key: { in: ["auth:pilot", "auth:pendingOwners"] } } });
    await prisma.$disconnect();
  }
});
