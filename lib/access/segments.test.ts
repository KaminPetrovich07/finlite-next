// Доступ ведомства к группе компаний (needs FL_TEST_PG_URL).
import { test } from "node:test";
import assert from "node:assert/strict";

test("database: ведомство видит компании группы, в том числе новые; снятие закрывает доступ", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { grantSegment, revokeSegment, setCompanySegment, listGrants } = await import("./segments");
  const { levelFor } = await import("@/lib/auth/access");
  const tag = `seg-${Date.now()}`;
  const owner = await prisma.user.create({ data: { email: `${tag}-o@test.kg`, name: "Владелец" } });
  const agency = await prisma.user.create({ data: { email: `${tag}-a@test.kg`, name: "Министерство" } });
  const other = await prisma.user.create({ data: { email: `${tag}-x@test.kg`, name: "Чужой" } });
  const seg = `Группа ${tag}`;
  const level = async (userId: string, companyId: string) => {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { ownerId: true, access: { where: { userId }, select: { level: true } } } });
    const u = await prisma.user.findUnique({ where: { id: userId } });
    return levelFor({ id: userId, role: u!.role }, { ownerId: c!.ownerId, sharedLevel: c!.access[0]?.level ?? null });
  };
  const a = await prisma.company.create({ data: { name: `${tag} A`, ownerId: owner.id } });
  const b = await prisma.company.create({ data: { name: `${tag} B`, ownerId: owner.id } });
  const outside = await prisma.company.create({ data: { name: `${tag} вне группы`, ownerId: owner.id } });
  try {
    await setCompanySegment(a.id, seg);
    assert.equal(await grantSegment(seg, agency.id, "view", null), 1);
    assert.equal(await level(agency.id, a.id), "view");
    assert.equal(await level(agency.id, outside.id), "none");
    // компания, попавшая в группу позже, сразу видна ведомству
    await setCompanySegment(b.id, seg);
    assert.equal(await level(agency.id, b.id), "view");
    // «изменение», выданное владельцем вручную, правило «просмотр» не понижает
    await prisma.companyAccess.update({ where: { companyId_userId: { companyId: b.id, userId: agency.id } }, data: { level: "edit" } });
    await grantSegment(seg, agency.id, "view", null);
    assert.equal(await level(agency.id, b.id), "edit");
    assert.equal(await level(other.id, a.id), "none");
    assert.equal(await revokeSegment(seg, agency.id), 2);
    assert.equal(await level(agency.id, a.id), "none");
    assert.ok(!(await listGrants()).some((g) => g.segment === seg));
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id, outside.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, agency.id, other.id] } } });
  }
});
