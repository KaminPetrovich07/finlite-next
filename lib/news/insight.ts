// «Разбор FinLite» к новости — без нейросетей и платных сервисов:
// свои графики из своих данных (курсы НБКР), графики редакции из чисел в тексте,
// что сделать в программе и где это в законе — по хэштегам новости.
import type { Rate } from "@/lib/fx/fx";

// ── Блоки в тексте публикации ───────────────────────────────────────────────
// {{курсы USD,EUR 90}}                       — график курсов НБКР за 90 дней
// {{график Инфляция, %: 2023=10,8; 2024=5}}  — столбцы из чисел редакции
// {{линия Ставка НБКР, %: янв=9; фев=9; мар=8,5}} — линия из чисел редакции

export interface FxBlock { type: "fx"; codes: string[]; days: number }
export interface DataBlock { type: "bars" | "line"; title: string; points: Array<{ label: string; value: number }> }
export type Block = FxBlock | DataBlock;
export type Segment = { type: "text"; text: string } | Block;

export const FX_DEFAULT = ["USD", "EUR", "RUB", "KZT"];
const TOKEN = /\{\{\s*([^{}]{1,2000}?)\s*\}\}/g;

export const num = (s: string): number | null => {
  const t = s.replace(/[\s ]/g, "").replace(/[−–]/g, "-").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

export function parseBlock(inner: string): Block | null {
  const m = inner.match(/^(курсы|график|столбцы|линия)\s*([\s\S]*)$/i);
  if (!m) return null;
  const word = m[1].toLowerCase(), rest = m[2].trim();
  if (word === "курсы") {
    const codes = [...new Set((rest.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? []))].slice(0, 6);
    const d = rest.match(/\b(\d{1,5})\b/);
    return { type: "fx", codes: codes.length ? codes : FX_DEFAULT, days: Math.min(Math.max(Number(d?.[1] ?? 90), 7), 730) };
  }
  // заголовок — до двоеточия перед первой парой «подпись=число»
  const eq = rest.indexOf("=");
  if (eq < 0) return null;
  const colon = rest.lastIndexOf(":", eq);
  const title = colon >= 0 ? rest.slice(0, colon).trim() : "";
  const points: DataBlock["points"] = [];
  for (const part of rest.slice(colon + 1).split(";")) {
    const i = part.lastIndexOf("=");
    if (i < 0) continue;
    const label = part.slice(0, i).trim(), value = num(part.slice(i + 1));
    if (label && value !== null) points.push({ label: label.slice(0, 40), value });
  }
  if (points.length < 2) return null;
  return { type: word === "линия" ? "line" : "bars", title: title.slice(0, 120), points: points.slice(0, 40) };
}

/** Текст → куски текста и блоки-графики. Нераспознанные {{…}} остаются текстом. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const b = parseBlock(m[1]);
    if (!b) continue;
    if (m.index! > last) out.push({ type: "text", text: text.slice(last, m.index) });
    out.push(b);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.filter((s) => s.type !== "text" || s.text.trim());
}

export const blocksOf = (text: string): Block[] => segments(text).filter((s): s is Block => s.type !== "text");

// ── Курсы: изменения за день, неделю, месяц, с начала года ─────────────────

export interface Change { abs: number; pct: number; from: string }
export interface FxStat { code: string; date: string; rate: number; day: Change | null; week: Change | null; month: Change | null; ytd: Change | null; min: number; max: number }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Изменения курса одной валюты. `rates` — любые записи, лишние валюты отбрасываются. */
export function fxStat(rates: Rate[], code: string, days = 90): FxStat | null {
  const list = rates.filter((r) => r.code === code && r.rate > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const last = list[list.length - 1];
  const onOrBefore = (d: string) => { let x: Rate | null = null; for (const r of list) { if (r.date <= d) x = r; else break; } return x; };
  const ch = (base: Rate | null): Change | null => (base && base.date < last.date ? { abs: r4(last.rate - base.rate), pct: r2(((last.rate - base.rate) / base.rate) * 100), from: base.date } : null);
  const window = list.filter((r) => r.date >= addDays(last.date, -days));
  return {
    code, date: last.date, rate: last.rate,
    day: ch(list.length > 1 ? list[list.length - 2] : null),
    week: ch(onOrBefore(addDays(last.date, -7))),
    month: ch(onOrBefore(addDays(last.date, -30))),
    ytd: ch(onOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`)),
    min: Math.min(...window.map((r) => r.rate)),
    max: Math.max(...window.map((r) => r.rate)),
  };
}

/** Точки для графика: по датам, курс в сомах и «индекс» (первая дата окна = 100), чтобы сравнивать валюты на одной шкале. */
export function fxSeries(rates: Rate[], codes: string[], days: number) {
  const lastDate = rates.reduce((m, r) => (r.date > m ? r.date : m), "");
  if (!lastDate) return [];
  const since = addDays(lastDate, -days);
  const byDate = new Map<string, Record<string, number | string>>();
  const base: Record<string, number> = {};
  for (const r of [...rates].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!codes.includes(r.code) || r.date < since) continue;
    base[r.code] ??= r.rate;
    const row = byDate.get(r.date) ?? { date: r.date };
    row[r.code] = r.rate;
    row[`${r.code}_i`] = Math.round((r.rate / base[r.code]) * 10000) / 100;
    byDate.set(r.date, row);
  }
  return [...byDate.values()];
}

// ── Текст «Разбора» по курсам — из чисел, по правилам ───────────────────────

const NAME: Record<string, [string, string]> = { // именительный, родительный
  USD: ["доллар США", "доллара"], EUR: ["евро", "евро"], RUB: ["российский рубль", "рубля"], KZT: ["казахстанский тенге", "тенге"],
  CNY: ["китайский юань", "юаня"], UZS: ["узбекский сум", "сума"], GBP: ["фунт стерлингов", "фунта"], TRY: ["турецкая лира", "лиры"],
};
const fmtRate = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`;
export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function move(pct: number): string {
  if (Math.abs(pct) < 0.05) return "почти не изменился";
  return pct > 0 ? `подорожал на ${fmtPct(pct).slice(1)}` : `подешевел на ${fmtPct(pct).slice(1)}`;
}

/** Абзацы разбора: что установил НБКР, кто сильнее всех изменился, что это значит для учёта. */
export function fxStory(stats: FxStat[]): string[] {
  const s = stats.filter(Boolean);
  if (!s.length) return [];
  const date = s.reduce((m, x) => (x.date > m ? x.date : m), "");
  const out: string[] = [];
  out.push(`Официальные курсы НБКР на ${dmy(date)}: ${s.map((x) => `${NAME[x.code]?.[0] ?? x.code} — ${fmtRate(x.rate)} сом`).join(", ")}.`);
  const usd = s.find((x) => x.code === "USD");
  if (usd) {
    const parts: string[] = [];
    if (usd.day) parts.push(`за день ${move(usd.day.pct)}`);
    if (usd.month) parts.push(`за месяц ${move(usd.month.pct)}`);
    if (usd.ytd) parts.push(`с начала года ${move(usd.ytd.pct)}`);
    if (parts.length) out.push(`Доллар ${parts.join(", ")}.${usd.ytd && Math.abs(usd.ytd.pct) >= 0.05 ? ` Сом к доллару с начала года ${usd.ytd.pct > 0 ? "ослаб" : "укрепился"}.` : ""}`);
  }
  const monthly = s.filter((x) => x.month).sort((a, b) => Math.abs(b.month!.pct) - Math.abs(a.month!.pct));
  if (monthly.length > 1 && Math.abs(monthly[0].month!.pct) >= 0.5) {
    const m = monthly[0];
    out.push(`Сильнее всего за месяц изменился курс ${NAME[m.code]?.[1] ?? m.code}: ${fmtPct(m.month!.pct)} (с ${fmtRate(m.rate - m.month!.abs)} до ${fmtRate(m.rate)} сом).`);
  }
  const wide = s.filter((x) => x.min > 0 && (x.max - x.min) / x.min >= 0.02);
  if (wide.length) out.push(`Разброс за период больше 2 % у ${wide.map((x) => NAME[x.code]?.[1] ?? x.code).join(", ")} — у тех, кто держит в этих валютах деньги или долги, курсовые разницы в отчётности будут заметными.`);
  return out;
}

// ── Что это значит и что сделать в FinLite — по хэштегам ───────────────────

export interface Action { label: string; href: string; why: string }
export interface LawLink { slug: string; title: string; q?: string }

const ACTIONS: Record<string, Action[]> = {
  курсы: [
    { label: "Курсы и переоценка", href: "/fx", why: "Пересчитать валютные остатки на конец месяца по курсу НБКР и провести курсовые разницы." },
    { label: "Закрытие месяца", href: "/close", why: "Переоценка валюты — один из шагов закрытия." },
  ],
  НБКР: [{ label: "Курсы НБКР", href: "/fx", why: "Курсы загружаются каждый день автоматически — проверьте, что они есть на дату операций." }],
  НДС: [
    { label: "ЭСФ", href: "/esf", why: "Сверить исходящие и входящие счета-фактуры, выгрузить продажи в XML для ЭСФ 2.0." },
    { label: "Налоговые отчёты", href: "/taxreports", why: "Посмотреть НДС к уплате и сроки отчёта." },
  ],
  ЭСФ: [{ label: "ЭСФ", href: "/esf", why: "Реестр ЭСФ → проводки и выгрузка продаж для ЭСФ 2.0." }],
  налоги: [
    { label: "Налоговый календарь", href: "/calendar", why: "Сроки отчётов и уплаты с напоминаниями." },
    { label: "Налоговые отчёты", href: "/taxreports", why: "Начисленные налоги по вашим проводкам." },
  ],
  единыйналог: [{ label: "Выбор налогового режима", href: "/compare", why: "Сравнить единый налог, патент и общий режим на ваших цифрах." }],
  патент: [{ label: "Выбор налогового режима", href: "/compare", why: "Посчитать, выгоден ли патент при вашем обороте." }],
  зарплата: [{ label: "Начислить зарплату", href: "/ledger?payroll=1", why: "Начисление с подоходным налогом и взносами в Соцфонд одной проводкой." }],
  соцфонд: [{ label: "Начислить зарплату", href: "/ledger?payroll=1", why: "Взносы в Соцфонд считаются при начислении зарплаты." }],
  ККМ: [{ label: "Учётная политика", href: "/policy", why: "Отметить порядок кассовых операций и ККМ." }],
  прослеживаемость: [{ label: "Склад", href: "/inventory", why: "Товары с кодами и единицами ОКЕИ — основа для прослеживаемости." }],
  таможня: [{ label: "Склад", href: "/inventory", why: "Себестоимость импорта с таможенными платежами." }],
  МСФО: [{ label: "Отчётность по МСФО", href: "/ifrs", why: "Отчёты по МСФО из тех же проводок." }],
  бухучет: [
    { label: "Финансовая отчётность", href: "/reports", why: "Баланс, отчёт о прибылях и убытках, движение денег." },
    { label: "Учётная политика", href: "/policy", why: "Зафиксировать выбранные способы учёта." },
  ],
  аудит: [{ label: "Пакеты и выгрузка", href: "/packages", why: "Собрать отчёты и регистры для аудитора одним архивом." }],
  ESG: [{ label: "ESG-отчёт", href: "/esg", why: "Нефинансовые показатели рядом с финансовыми." }],
  госзакупки: [{ label: "Контрагенты", href: "/counterparties", why: "Расчёты с заказчиками и поставщиками по договорам." }],
  банки: [{ label: "Банковские выписки", href: "/transactions", why: "Загрузить выписку и разнести операции." }],
  учетнаяставка: [{ label: "План-факт и прогноз денег", href: "/budget", why: "Пересчитать стоимость кредитов и прогноз денег." }],
  инфляция: [{ label: "План-факт и прогноз денег", href: "/budget", why: "Заложить рост цен в план расходов." }],
};

const LAWS: Record<string, LawLink[]> = {
  налоги: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс" }],
  НДС: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс", q: "налог на добавленную стоимость" }],
  ЭСФ: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс", q: "счет-фактур" }],
  ККМ: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс", q: "контрольно-кассов" }],
  единыйналог: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс", q: "единый налог" }],
  патент: [{ slug: "nalogovyj-kodeks", title: "Налоговый кодекс", q: "патент" }],
  зарплата: [{ slug: "trudovoj-kodeks", title: "Трудовой кодекс", q: "заработн" }],
  соцфонд: [{ slug: "trudovoj-kodeks", title: "Трудовой кодекс" }],
  НБКР: [{ slug: "zakon-o-nbkr", title: "Закон «О Национальном банке»" }],
  курсы: [{ slug: "zakon-o-nbkr", title: "Закон «О Национальном банке»", q: "курс" }],
  учетнаяставка: [{ slug: "zakon-o-nbkr", title: "Закон «О Национальном банке»", q: "ставк" }],
  банки: [{ slug: "zakon-o-bankah", title: "Закон «О банках и банковской деятельности»" }],
  страхование: [{ slug: "zakon-ob-organizacii-strahovaniya", title: "Закон «Об организации страхования»" }],
  фондовыйрынок: [{ slug: "zakon-o-rynke-cennyh-bumag", title: "Закон «О рынке ценных бумаг»" }],
  госзакупки: [{ slug: "zakon-o-goszakupkah", title: "Закон «О государственных закупках»" }],
  бухучет: [{ slug: "zakon-o-buhgalterskom-uchete", title: "Закон «О бухгалтерском учете»" }],
  МСФО: [{ slug: "zakon-o-buhgalterskom-uchete", title: "Закон «О бухгалтерском учете»", q: "международн" }],
  аудит: [{ slug: "zakon-ob-auditorskoj-deyatelnosti", title: "Закон «Об аудиторской деятельности»" }],
};

const uniq = <T,>(list: T[], key: (x: T) => string) => { const s = new Set<string>(); return list.filter((x) => (s.has(key(x)) ? false : (s.add(key(x)), true))); };

export const actionsFor = (tags: string[]): Action[] => uniq(tags.flatMap((t) => ACTIONS[t] ?? []), (a) => a.href).slice(0, 4);
export const lawsFor = (tags: string[]): LawLink[] => uniq(tags.flatMap((t) => LAWS[t] ?? []), (l) => l.slug).slice(0, 3);

/** Нужен ли новости график курсов: хэштег или явное упоминание курса/валюты. */
export function wantsFx(tags: string[], title: string): boolean {
  return tags.some((t) => t === "курсы" || t === "НБКР" || t === "учетнаяставка") || /курс[а-я]*\s+(валют|доллар|рубл|евро|сом|тенге)|девальвац|обменн/i.test(title);
}
