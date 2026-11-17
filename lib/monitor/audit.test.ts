// Журнал действий в базе: цепочка, подделка записи и конкурирующие записи (needs FL_TEST_PG_URL).
import { test } from "node:test";
import assert from "node:assert/strict";

test("database: цепочка журнала выдерживает параллельные записи и ловит правку в базе", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { appendActivity, verifyActivityChain } = await import("./audit");
  const before = await verifyActivityChain();
  // 20 записей одновременно: блокировка выстраивает их в одну цепочку
  await Promise.all(Array.from({ length: 20 }, (_, i) => appendActivity({ userId: null, action: "test_parallel", details: { i } })));
  await appendActivity({ userId: null, action: "active_day" }); // не в цепочке
  const ok = await verifyActivityChain();
  assert.equal(ok.breaks.length, before.breaks.length);
  assert.equal(ok.checked, before.checked + 20);
  // правка «напрямую в базе» видна
  const victim = await prisma.activityLog.findFirst({ where: { action: "test_parallel" }, orderBy: { createdAt: "desc" } });
  await prisma.activityLog.update({ where: { id: victim!.id }, data: { details: { i: 999 } } });
  const bad = await verifyActivityChain();
  assert.ok(bad.breaks.some((b) => b.id === victim!.id && b.kind === "changed"));
  // вернуть как было: цепочка снова цела (записи остаются — удаление из середины само было бы разрывом)
  await prisma.activityLog.update({ where: { id: victim!.id }, data: { details: victim!.details as object } });
  assert.equal((await verifyActivityChain()).breaks.length, before.breaks.length);
});
