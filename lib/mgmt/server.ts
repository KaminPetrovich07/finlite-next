// Сервер управленческого учёта: настройки аналитик и правил (CompanyRecord «mgmt», key «main»),
// явная разметка проводок (CompanyRecord «mgmtTag», key = id проводки). Объекты раздела «Стройка»
// сами становятся значениями аналитики «Проект / объект».
import { prisma } from "@/lib/db";
import { getRecord, putRecord } from "@/lib/records";
import { HttpError } from "@/lib/http-error";
import { listObjects } from "@/lib/build/server";
import { loadCompanyContext } from "@/lib/server/company-context";
import { buildValueId, demoSettings, DIM_KINDS, emptySettings, validateSettings, type DimKind, type MgmtSettings, type Tags } from "./model";

const KIND = "mgmt" as const;
const TAG = "mgmtTag" as const;

/** Настройки компании с объектами строительства в аналитике «Проект / объект». */
export async function loadSettings(companyId: string): Promise<MgmtSettings> {
  const s = { ...emptySettings(), ...((await getRecord<MgmtSettings>(companyId, KIND, "main")) ?? {}) };
  const objects = await listObjects(companyId).catch(() => []);
  const own = s.dims.filter((d) => !d.auto);
  const auto = objects.map((o) => ({ id: buildValueId(o.id), kind: "project" as const, name: o.name, auto: true, archived: o.status === "done" ? true : undefined }));
  return { ...s, dims: [...own, ...auto] };
}

export async function saveSettings(companyId: string, input: MgmtSettings): Promise<MgmtSettings> {
  const s: MgmtSettings = {
    dims: input.dims.filter((d) => !d.auto).map((d) => ({ ...d, name: d.name.trim(), code: d.code?.trim() || undefined })),
    rules: input.rules.map((r) => ({ ...r, account: r.account?.trim() || undefined, party: r.party?.trim() || undefined, text: r.text?.trim() || undefined })),
    alloc: input.alloc ?? {},
    ...(input.behavior && Object.keys(input.behavior).length ? { behavior: input.behavior } : {}),
  };
  const p = validateSettings(s);
  if (p.length) throw new HttpError(400, p.join("; "));
  await putRecord(companyId, KIND, "main", s);
  return loadSettings(companyId);
}

export async function loadTags(companyId: string): Promise<Map<string, Tags>> {
  const rows = await prisma.companyRecord.findMany({ where: { companyId, kind: TAG }, select: { key: true, data: true } });
  return new Map(rows.map((r) => [r.key, (r.data ?? {}) as Tags]));
}

/** Ставит или снимает (null) значения аналитик у проводок; пустая разметка удаляется. */
export async function setTags(companyId: string, entryIds: string[], patch: Partial<Record<DimKind, string | null>>): Promise<number> {
  const ids = [...new Set(entryIds)].slice(0, 5000);
  const own = await prisma.journalEntry.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } });
  const cur = await loadTags(companyId);
  const ops = [];
  for (const { id } of own) {
    const t: Tags = { ...(cur.get(id) ?? {}) };
    for (const k of DIM_KINDS) { const v = patch[k]; if (v === null || v === "") delete t[k]; else if (v) t[k] = v; }
    if (Object.keys(t).length) {
      ops.push(prisma.companyRecord.upsert({ where: { companyId_kind_key: { companyId, kind: TAG, key: id } }, create: { companyId, kind: TAG, key: id, data: t }, update: { data: t } }));
    } else ops.push(prisma.companyRecord.deleteMany({ where: { companyId, kind: TAG, key: id } }));
  }
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));
  return own.length;
}

/** Журнал, настройки и разметка компании (у демо — готовые настройки мебельщика). */
export async function mgmtContext(companyId: string) {
  const ctx = await loadCompanyContext(companyId);
  if (ctx.demo) return { ctx, settings: demoSettings(), tags: new Map<string, Tags>() };
  const [settings, tags] = await Promise.all([loadSettings(companyId), loadTags(companyId)]);
  return { ctx, settings, tags };
}
