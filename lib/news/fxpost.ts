// Ежедневная заметка «Курсы НБКР» — собственный материал FinLite из таблицы курсов:
// цифры, изменения за день/месяц/год, график и что это значит для учёта.
import { prisma } from "@/lib/db";
import { loadRates } from "@/lib/fx/store";
import { dmy, FX_DEFAULT, fxStat, fxStory, type FxStat } from "./insight";

export const FX_SOURCE = "https://www.nbkr.kg/";
const KEEP_DAYS = 14; // старые ежедневные заметки прячем из ленты, чтобы не забивали её

const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`;
const rate = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Текст заметки: разбор по числам, график, практический смысл. Чистая функция — для тестов. */
export function fxArticle(stats: FxStat[]): { title: string; summary: string; body: string } | null {
  const usd = stats.find((s) => s.code === "USD");
  if (!usd) return null;
  const story = fxStory(stats);
  const title = `Курсы НБКР на ${dmy(usd.date)}: доллар ${rate(usd.rate)} сом${usd.day ? ` (${pct(usd.day.pct)} за день)` : ""}`;
  const body = [
    ...story,
    `{{курсы ${stats.map((s) => s.code).join(",")} 90}}`,
    "Как читать график: каждая линия показывает, на сколько процентов курс валюты отличается от первого дня периода (первый день = 100). Так доллар, евро, рубль и тенге видны на одной шкале, хотя стоят по-разному. Точные курсы — в таблице под графиком.",
    "Что это значит для учёта. Деньги и долги в валюте (касса, банковские счета, расчёты с иностранными покупателями и поставщиками) на отчётную дату пересчитываются по официальному курсу НБКР, разница отражается как курсовой доход или расход. Авансы и запасы, купленные за валюту, не пересчитываются — они остаются по курсу на дату операции.",
    "В FinLite курсы загружаются каждый день автоматически: при вводе валютной операции курс подставляется сам, а переоценку на конец месяца делает раздел «Валюта» одной кнопкой.",
  ].join("\n\n");
  return { title, summary: story[1] ?? story[0] ?? title, body };
}

/** Опубликовать заметку за последний день, на который есть курсы. Повторный вызов в тот же день ничего не делает. */
export async function publishFxDaily(): Promise<{ added: boolean; date?: string }> {
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const rates = await loadRates(today, FX_DEFAULT);
  const stats = FX_DEFAULT.map((c) => fxStat(rates, c, 90)).filter((s): s is FxStat => !!s);
  const art = fxArticle(stats);
  if (!art) return { added: false };
  const date = stats.find((s) => s.code === "USD")!.date;
  const externalId = `fx:${date}`;
  if (await prisma.post.findUnique({ where: { externalId }, select: { id: true } })) return { added: false, date };
  await prisma.post.create({
    data: {
      kind: "news", ...art, sourceUrl: FX_SOURCE, sourceName: "НБКР", externalId, auto: false,
      docDate: new Date(`${date}T00:00:00Z`), tags: ["курсы", "НБКР"], authorName: "FinLite", authorOrg: "по официальным данным НБКР",
    },
  });
  // прошлые ежедневные заметки без обсуждения — из ленты (остаются у администратора)
  await prisma.post.updateMany({
    where: { externalId: { startsWith: "fx:" }, status: "published", createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 864e5) }, comments: { none: {} } },
    data: { status: "hidden" },
  });
  return { added: true, date };
}
