// Сервер: данные для «Разбора FinLite» на странице публикации.
import { prisma } from "@/lib/db";
import { loadRates } from "@/lib/fx/store";
import { actionsFor, blocksOf, FX_DEFAULT, fxSeries, fxStat, fxStory, lawsFor, wantsFx, type FxStat } from "./insight";

export interface FxData { codes: string[]; days: number; series: Array<Record<string, number | string>>; stats: FxStat[] }
export interface Insight {
  story: string[];                   // авторазбор по данным (курсы)
  fx: Record<string, FxData>;        // ключ — `${codes}|${days}`: для блоков {{курсы …}} и авто-графика
  autoFx: string | null;             // ключ авто-графика, если в тексте его нет
  actions: ReturnType<typeof actionsFor>;
  laws: Array<ReturnType<typeof lawsFor>[number] & { loaded: boolean }>;
  related: Array<{ id: string; title: string; createdAt: Date; sourceName: string | null }>;
}

export const fxKey = (codes: string[], days: number) => `${codes.join(",")}|${days}`;
const today = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Бишкек, UTC+6

export async function insightFor(p: { id: string; title: string; body: string; analysis: string | null; tags: string[] }): Promise<Insight> {
  const blocks = [...blocksOf(p.analysis ?? ""), ...blocksOf(p.body)];
  const fxBlocks = blocks.filter((b) => b.type === "fx") as Array<{ codes: string[]; days: number }>;
  const auto = wantsFx(p.tags, p.title) && !fxBlocks.length ? { codes: FX_DEFAULT, days: 90 } : null;
  const wanted = [...fxBlocks, ...(auto ? [auto] : [])];

  const fx: Insight["fx"] = {};
  let story: string[] = [];
  if (wanted.length) {
    const codes = [...new Set(wanted.flatMap((b) => b.codes))];
    const rates = await loadRates(today(), codes).catch(() => []);
    for (const b of wanted) {
      const stats = b.codes.map((c) => fxStat(rates, c, b.days)).filter((s): s is FxStat => !!s);
      fx[fxKey(b.codes, b.days)] = { codes: b.codes, days: b.days, series: fxSeries(rates, b.codes, b.days), stats };
    }
    const main = fx[fxKey(wanted[0].codes, wanted[0].days)];
    story = fxStory(main.stats);
  }

  const laws = lawsFor(p.tags);
  const loaded = laws.length
    ? new Set((await prisma.legalDoc.findMany({ where: { slug: { in: laws.map((l) => l.slug) }, text: { not: null } }, select: { slug: true } }).catch(() => [])).map((d) => d.slug))
    : new Set<string>();

  const related = p.tags.length
    ? await prisma.post.findMany({
      where: { id: { not: p.id }, status: "published", tags: { hasSome: p.tags }, createdAt: { gte: new Date(Date.now() - 60 * 864e5) } },
      orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true, createdAt: true, sourceName: true },
    })
    : [];

  return {
    story, fx, autoFx: auto ? fxKey(auto.codes, auto.days) : null,
    actions: actionsFor(p.tags),
    laws: laws.map((l) => ({ ...l, loaded: loaded.has(l.slug) })),
    related,
  };
}
