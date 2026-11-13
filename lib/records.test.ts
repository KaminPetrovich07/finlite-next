// Saving company records over somebody else's newer version is refused (needs FL_TEST_PG_URL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeVersions, encodeVersions } from "./request-context";

test("versions header round-trip", () => {
  const m = new Map([["policy/main", "2026-11-13T10:00:00.000Z"], ["budget/2026", "2026-11-13T10:00:01.000Z"], ["costing/2026-10-01_2026-10-31", "x@y,z"]]);
  assert.deepEqual(decodeVersions(encodeVersions(m)), m);
  assert.equal(decodeVersions("garbage,@x,%E0%A4%A@1").size, 0);
});

test("database: optimistic concurrency of putRecord", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { putRecordAs, CONFLICT_MESSAGE } = await import("./records");
  const company = await prisma.company.create({ data: { name: `records-test-${Date.now()}` } });
  const c = company.id;
  const ver = async () => (await prisma.companyRecord.findUnique({ where: { companyId_kind_key: { companyId: c, kind: "policy", key: "main" } } }))!.updatedAt.toISOString();
  try {
    await putRecordAs(c, "policy", "main", { v: 1 }, { expected: null, client: "tabA" });
    const v1 = await ver();
    // A and B both opened version 1; B saves first
    await putRecordAs(c, "policy", "main", { v: "B" }, { expected: v1, client: "tabB" });
    // A's save over the old version is refused
    await assert.rejects(putRecordAs(c, "policy", "main", { v: "A" }, { expected: v1, client: "tabA" }), (e: Error & { status?: number }) => e.status === 409 && e.message === CONFLICT_MESSAGE);
    const row = await prisma.companyRecord.findFirst({ where: { companyId: c, kind: "policy" } });
    assert.deepEqual(row!.data, { v: "B" });
    // B saving twice quickly from the same tab (second request still carries v1) is not a conflict
    await putRecordAs(c, "policy", "main", { v: "B2" }, { expected: v1, client: "tabB" });
    // with the current version A can save
    await putRecordAs(c, "policy", "main", { v: "A2" }, { expected: await ver(), client: "tabA" });
    // no header (cron, scripts) — saves as before
    await putRecordAs(c, "policy", "main", { v: "cron" }, { expected: null, client: null });
    assert.deepEqual((await prisma.companyRecord.findFirst({ where: { companyId: c, kind: "policy" } }))!.data, { v: "cron" });
  } finally {
    await prisma.company.delete({ where: { id: c } });
    await prisma.$disconnect();
  }
});
