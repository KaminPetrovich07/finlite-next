// ════════════════════════════════════════════════════════════════════════
// lib/esg/report.ts — ESG-отчёт (отчёт об устойчивом развитии) как документ.
//
// Структура повторяет отчёты по GRI 2021 и IFRS S1/S2: резюме, обращение,
// профиль, ключевые показатели со сносками-методиками, существенность,
// экология (ПГ, энергия, вода, отходы, климатические риски), социальная
// сфера, управление, экономическая стоимость, рекомендации, приложения
// (методика и коэффициенты, указатель GRI, IFRS S1/S2, термины).
//
// Весь текст собирается из цифр по правилам — без генеративной модели:
// каждое утверждение можно проследить до формулы или проводки.
// ════════════════════════════════════════════════════════════════════════

import type { Statements } from "@/lib/ledger/engine";
import type { Period } from "@/lib/ledger/types";
import { periodLabel } from "@/lib/ledger/period";
import { REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import { sup, type Block, type ReportDoc, type Section, type TableBlock } from "@/lib/reports/model";
import { computeEsg, PILLAR_LABEL, QUALITY_LABEL, type EsgResult, type Indicator, type Pillar } from "./compute";
import { DEFAULT_FACTORS, FUELS, GRID, HEAT, TRANSPORT, gjPerUnit, kgCo2PerUnit, type Fuel } from "./factors";
import { EMPTY_ESG, INDUSTRY_LABEL, type EsgInput } from "./input";
import { climateRisks, LEVEL_LABEL, SCORE_SCALE, scoreTopics } from "./materiality";
import { recommendations, type Recommendation } from "./recommendations";
import { cap, change, listRu, mln, num, pct, plural, share, som, t } from "./text";

export interface EsgReportInput {
  company: { id: string; name: string; regime: RegimeKey | null; regimeName: string };
  period: Period;
  statements: Statements;
  previous: Statements | null;
  esg: EsgInput | null;
  prevEsg: EsgInput | null;
}

const SRC_LABEL = { ledger: "журнал проводок", input: "данные компании", calc: "расчёт" } as const;

export function buildEsgReport(d: EsgReportInput): ReportDoc {
  const input = d.esg ?? EMPTY_ESG;
  const hasInput = !!d.esg;
  const hasPrev = !!d.previous && d.previous.entryCount > 0;
  const r = computeEsg(d.statements, input, hasPrev ? d.previous : null, hasPrev ? d.prevEsg : null);
  const prevR = hasPrev && d.previous ? computeEsg(d.previous, d.prevEsg ?? EMPTY_ESG) : null;
  const recs = recommendations(r, input, d.statements, Number(d.period.to.slice(0, 4)));
  const pl = periodLabel(d.period.from, d.period.to);
  const plLower = pl.charAt(0).toLowerCase() + pl.slice(1);
  const prevPl = d.previous ? periodLabel(d.previous.period.from, d.previous.period.to) : "";
  const ctx: Ctx = { d, input, hasInput, hasPrev, r, prevR, recs, pl, plLower, prevPl };

  const now = new Date();
  return tidy({
    package: "esg",
    title: "Отчёт об устойчивом развитии",
    subtitle: `ESG-отчёт · ${pl}`,
    toc: true,
    company: d.company.name,
    regime: d.company.regimeName,
    period: pl,
    generatedAt: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    disclaimer: hasInput ? undefined : "Нефинансовые данные (энергия, персонал, органы управления) за этот период не введены. Показатели из журнала проводок раскрыты полностью, остальные разделы — частично. Заполните данные на странице ESG.",
    sections: [
      summary(ctx), ceo(ctx), profile(ctx), keyIndicators(ctx), materiality(ctx),
      environment(ctx), social(ctx), governance(ctx), economic(ctx), recommendationsSection(ctx),
      methodology(ctx), griIndex(ctx), ifrs(ctx), glossary(),
    ],
  });
}

/** Generated sentences end with units like «CO₂-экв.» — drop the doubled period. */
function tidy(doc: ReportDoc): ReportDoc {
  const fix = (x: string) => x.replace(/\.\.(?!\.)/g, ".").replace(/\.\s*\./g, ".");
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.type === "p" || b.type === "note" || b.type === "h2" || b.type === "h3") b.text = fix(b.text);
      else if (b.type === "callout") { b.text = fix(b.text); if (b.title) b.title = fix(b.title); }
      else if (b.type === "list") b.items = b.items.map(fix);
      else if (b.type === "table" && b.footnotes) b.footnotes = b.footnotes.map(fix);
    }
  }
  return doc;
}

interface Ctx {
  d: EsgReportInput;
  input: EsgInput;
  hasInput: boolean;
  hasPrev: boolean;
  r: EsgResult;
  prevR: EsgResult | null;
  recs: Recommendation[];
  pl: string;
  plLower: string;
  prevPl: string;
}

const p = (text: string): Block => ({ type: "p", text });

// ── 1. Резюме ──────────────────────────────────────────────────────────────

function summary(c: Ctx): Section {
  const { r, d } = c;
  const is = d.statements.incomeStatement;
  const e = r.emissions;
  const blocks: Block[] = [];
  const key: string[] = [];
  if (e.scope12 > 0) key.push(`выбросы Охватов 1 и 2 — ${t(e.scope12)}${e.perMlnRevenue !== null ? `, ${num(e.perMlnRevenue, 3)} т на 1 млн сом выручки` : ""}`);
  if (r.energy.totalMwh > 0) key.push(`энергопотребление — ${num(r.energy.totalMwh, 1)} МВт·ч`);
  if (r.workforce.end > 0) key.push(`${num(r.workforce.end, 0)} ${plural(r.workforce.end, ["сотрудник", "сотрудника", "сотрудников"])}, средняя зарплата ${som(r.pay.avgWage)}`);
  key.push(`создано экономической стоимости на ${mln(r.economic.generated)}, из них работникам — ${mln(r.economic.employees)}, государству — ${mln(r.economic.government)}`);
  blocks.push({ type: "callout", tone: "key", title: `Главное за ${c.plLower}`, text: cap(key.join("; ")) + "." });

  blocks.push({ type: "kpis", items: [
    { label: "Выбросы, Охваты 1+2, т CO₂-экв.", value: e.scope12 > 0 ? num(e.scope12, 2) : "нет данных", note: c.prevR && c.prevR.emissions.scope12 > 0 ? deltaNote(e.scope12, c.prevR.emissions.scope12) : e.perMlnRevenue !== null ? `${num(e.perMlnRevenue, 3)} т на 1 млн сом` : undefined },
    { label: "Энергопотребление", value: r.energy.totalMwh > 0 ? `${num(r.energy.totalMwh, 1)} МВт·ч` : "нет данных", note: r.energy.cost > 0 ? `расходы ${som(r.energy.cost)}` : undefined },
    { label: "Персонал", value: r.workforce.end > 0 ? `${num(r.workforce.end, 0)} чел.` : "нет данных", note: r.workforce.womenShare !== null ? `женщин ${pct(r.workforce.womenShare)}` : undefined },
    { label: "Распределено стоимости", value: mln(r.economic.distributed), note: `${pct(share(r.economic.distributed, r.economic.generated) ?? 0)} созданной` },
  ] });

  blocks.push({ type: "h2", text: "Пересказ отчётного периода" });
  blocks.push(p(`${d.company.name} подготовила отчёт об устойчивом развитии за ${c.plLower}. Отчёт охватывает экологические, социальные и управленческие (ESG) аспекты деятельности и составлен с учётом стандартов GRI (редакция 2021 года), требований IFRS S1 и S2 и стандарта GHG Protocol. Финансовые показатели взяты из журнала хозяйственных операций компании и сверены с бухгалтерской отчётностью за тот же период.`));
  blocks.push(p(`За период чистая выручка составила ${mln(is.netRevenue)}, чистая прибыль — ${mln(is.netProfit)} (${pct(is.margin)} от выручки).${c.hasPrev && d.previous ? ` Выручка ${change(is.netRevenue / 1e6, d.previous.incomeStatement.netRevenue / 1e6, { fem: true, unit: "млн сом", d: 2 })}.` : ""}`));
  blocks.push(p(emissionsSummaryText(c)));
  if (r.workforce.end > 0) blocks.push(p(socialSummaryText(c)));
  blocks.push(p(governanceSummaryText(c)));
  const high = c.recs.filter((x) => x.priority === "Высокий");
  if (c.recs.length) {
    blocks.push({ type: "h2", text: "Приоритеты на следующий период" });
    blocks.push(p(`По результатам анализа сформировано ${c.recs.length} ${plural(c.recs.length, ["рекомендация", "рекомендации", "рекомендаций"])}${high.length ? `, из них ${high.length} — с высоким приоритетом` : ""}. Ключевые:`));
    blocks.push({ type: "list", items: c.recs.slice(0, 5).map((x) => `${x.title} (${x.priority.toLowerCase()} приоритет, ${x.horizon}).`) });
  }
  if (r.gaps.length) {
    blocks.push({ type: "callout", tone: "warn", title: "Ограничения данных", text: `Часть показателей раскрыта частично: не хватает данных — ${r.gaps.join("; ")}.` });
  }
  return { title: "Резюме", sheet: "Резюме", blocks };
}

function deltaNote(cur: number, prev: number): string {
  if (!prev) return "";
  const dlt = ((cur - prev) / Math.abs(prev)) * 100;
  return `${dlt >= 0 ? "+" : "−"}${pct(Math.abs(dlt))} к прошлому периоду`;
}

function emissionsSummaryText(c: Ctx): string {
  const e = c.r.emissions;
  if (e.scope12 <= 0) return "Данные о потреблении энергии и топлива за период не введены, поэтому выбросы парниковых газов не рассчитаны. Расходы на энергию и коммунальные услуги по данным учёта составили " + som(c.r.energy.cost) + ".";
  const main = [
    { k: "электроэнергия", v: e.electricity }, { k: "тепловая энергия", v: e.heat },
    { k: "стационарное сжигание топлива", v: e.stationary }, { k: "автопарк", v: e.mobile },
  ].sort((a, b) => b.v - a.v)[0];
  let s = `Выбросы парниковых газов по Охватам 1 и 2 составили ${t(e.scope12)}: Охват 1 (собственное сжигание топлива) — ${t(e.scope1)}, Охват 2 (купленные электроэнергия и тепло) — ${t(e.scope2)}. Крупнейший источник — ${main.k} (${pct(share(main.v, e.scope12) ?? 0)}).`;
  if (c.prevR && c.prevR.emissions.scope12 > 0) s += ` По сравнению с периодом «${c.prevPl}» выбросы ${change(e.scope12, c.prevR.emissions.scope12, { plural: true, unit: "т", d: 2 })}.`;
  if (e.scope3 > 0) s += ` Дополнительно оценены выбросы Охвата 3 по поездкам сотрудников и командировкам — ${t(e.scope3)}.`;
  return s;
}

function socialSummaryText(c: Ctx): string {
  const w = c.r.workforce, pay = c.r.pay;
  let s = `На конец периода в компании ${num(w.end, 0)} ${plural(w.end, ["сотрудник", "сотрудника", "сотрудников"])}${w.womenShare !== null ? `, доля женщин — ${pct(w.womenShare)}` : ""}. Фонд оплаты труда — ${som(pay.payroll)}, средняя начисленная зарплата — ${som(pay.avgWage)} в месяц`;
  if (pay.toNational !== null) s += ` (${pct(pay.toNational)} от средней по стране)`;
  s += `. Работодатель начислил страховых взносов на ${som(pay.social)}.`;
  if (c.input.injuries === 0) s += " Несчастных случаев на производстве не зафиксировано.";
  return s;
}

function governanceSummaryText(c: Ctx): string {
  const g = c.r.governance, tx = c.r.tax;
  const adopted = g.policies.filter((x) => x.adopted).length;
  let s = `В бюджет перечислено ${som(tx.paidToBudget)}, налоговая нагрузка — ${pct(tx.burdenPct ?? 0, 2)} выручки (налоговый режим — «${c.d.company.regimeName}»).`;
  s += tx.finesBudget > 0 ? ` Начислены штрафы и пени в бюджет — ${som(tx.finesBudget)}.` : " Штрафов и пеней в бюджет за период не начислено.";
  s += ` Утверждено ${adopted} из ${g.policies.length} базовых политик в области устойчивого развития.`;
  const okChecks = c.d.statements.checks.filter((x) => x.status === "ok").length;
  s += ` Финансовая отчётность, на которой основан ESG-отчёт, проходит ${okChecks} из ${c.d.statements.checks.length} автоматических сверок.`;
  return s;
}

// ── 2. Обращение ───────────────────────────────────────────────────────────

function ceo(c: Ctx): Section {
  const text = c.input.ceoMessage.trim();
  if (text) {
    return { title: "Обращение руководителя", sheet: "Обращение", blocks: text.split(/\n{2,}/).map((x) => p(x.trim())) };
  }
  const e = c.r.emissions;
  const top = c.recs.filter((x) => x.priority === "Высокий");
  const high = (top.length ? top : c.recs).slice(0, 3).map((x) => x.title.charAt(0).toLowerCase() + x.title.slice(1));
  return {
    title: "Обращение руководителя", sheet: "Обращение", blocks: [
      { type: "callout", tone: "info", text: "Черновик сформирован автоматически по данным отчёта. Руководитель может заменить его своим текстом на странице ESG (поле «Обращение руководителя»)." },
      p("Уважаемые партнёры, коллеги и клиенты!"),
      p(`Представляем отчёт ${c.d.company.name} об устойчивом развитии за ${c.plLower}. Мы считаем, что ответственное отношение к людям, окружающей среде и обществу — условие долгосрочного успеха бизнеса, и раскрываем свои результаты открыто, с методикой расчёта каждого показателя.`),
      p(e.scope12 > 0 && c.prevR && c.prevR.emissions.scope12 > 0
        ? `Выбросы парниковых газов Охватов 1 и 2 составили ${t(e.scope12)} и ${change(e.scope12, c.prevR.emissions.scope12, { plural: true, unit: "т", d: 2 })}.`
        : e.scope12 > 0
        ? `Впервые мы посчитали свой углеродный след: выбросы Охватов 1 и 2 составили ${t(e.scope12)}. Это база, от которой мы будем измерять прогресс.`
        : "Мы начали системный сбор данных об энергопотреблении и выбросах, чтобы в следующем отчёте раскрыть углеродный след компании."),
      p(`Наши сотрудники — главная ценность компании. ${c.r.pay.payroll > 0 ? `За период мы направили на оплату их труда ${som(c.r.pay.payroll)} и уплатили ${som(c.r.pay.social)} страховых взносов.` : ""}`.trim()),
      p(high.length ? `Главные задачи на следующий период: ${listRu(high)}. План мер и показатели контроля приведены в разделе «Рекомендации».` : "В следующем периоде мы продолжим работу по всем направлениям, отражённым в отчёте."),
      p("Благодарим всех, кто вместе с нами строит устойчивый бизнес в Кыргызстане."),
    ],
  };
}

// ── 3. О компании и об отчёте ──────────────────────────────────────────────

function profile(c: Ctx): Section {
  const { d, input, r } = c;
  const is = d.statements.incomeStatement;
  const bs = d.statements.balanceSheet.closing;
  const regime = d.company.regime ? REGIME_INFO[d.company.regime] : null;
  const desc = input.companyDescription.trim();
  return {
    title: "О компании и об отчёте", sheet: "О компании", blocks: [
      { type: "h2", text: "Профиль компании" },
      ...(desc ? desc.split(/\n{2,}/).map((x) => p(x.trim())) : [p(`${d.company.name} работает в отрасли «${INDUSTRY_LABEL[input.industry].toLowerCase()}»${input.region ? `, регион — ${input.region}` : ""}. Налоговый режим — «${d.company.regimeName}»${regime ? ` (${regime.article})` : ""}.`)]),
      { type: "table", columns: [{ label: "Показатель", width: 60 }, { label: "Значение", width: 40 }], rows: [
        { cells: ["Отрасль", INDUSTRY_LABEL[input.industry]] },
        ...(input.region ? [{ cells: ["Регион", input.region] as TableBlock["rows"][number]["cells"] }] : []),
        { cells: ["Налоговый режим", d.company.regimeName] },
        { cells: ["Чистая выручка за период", som(is.netRevenue)] },
        { cells: ["Чистая прибыль за период", som(is.netProfit)] },
        { cells: ["Активы на конец периода", som(bs[299] ?? 0)] },
        { cells: ["Собственный капитал", som(bs[541] ?? 0)] },
        ...(r.workforce.end > 0 ? [{ cells: ["Численность персонала на конец периода", `${num(r.workforce.end, 0)} чел.`] as TableBlock["rows"][number]["cells"] }] : []),
      ] },
      { type: "h2", text: "Об отчёте" },
      p(`Отчёт охватывает период ${c.plLower} (${fmtDate(d.period.from)} — ${fmtDate(d.period.to)}) и совпадает с периодом финансовой отчётности. Отчёт подготовлен с учётом Стандартов GRI (редакция 2021 года, GRI 1: Foundation 2021), стандартов IFRS S1 «Общие требования к раскрытию информации, связанной с устойчивым развитием» и IFRS S2 «Раскрытие информации, связанной с климатом», а также GHG Protocol Corporate Standard для расчёта выбросов парниковых газов.`),
      p("Граница отчёта — операционный контроль: в отчёт включены все объекты и виды деятельности, которыми компания управляет. Денежные показатели получены из журнала хозяйственных операций, который ведётся по Плану счетов, утверждённому постановлением Правительства КР от 7 октября 2010 года № 231; формы финансовой отчётности сверяются между собой автоматически. Нефинансовые данные (потребление энергии, численность, обучение, органы управления) предоставлены ответственными сотрудниками компании."),
      p(c.hasPrev ? `Для сравнения приведены данные за предыдущий период равной продолжительности — ${c.prevPl.toLowerCase()}. Методика расчёта в обоих периодах одинакова.` : "Сравнительные данные за предыдущий период отсутствуют: отчёт подготовлен впервые или учёт за прошлый период в системе не вёлся. Этот период является базовым для сравнения в будущих отчётах."),
      p("Внешняя проверка (заверение) отчёта не проводилась. Отчёт сформирован в системе FinLite KG; методика каждого показателя приведена в сносках и в приложении «Методика и коэффициенты»."),
      ...(c.input.esgOwner.trim() ? [p(`Ответственный за подготовку отчёта и вопросы устойчивого развития — ${c.input.esgOwner.trim()}.`)] : []),
    ],
  };
}

function fmtDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

// ── 4. Ключевые показатели ─────────────────────────────────────────────────

function fmtVal(v: number | string | null, unit: string): string {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  const d = unit.includes("т CO₂") || unit.includes("/ млн") || unit.includes("/ чел") ? 3 : unit === "%" || unit.includes("%") ? 1 : unit === "сом" || unit.includes("сом /") ? 0 : 2;
  return num(v, d);
}

function changeCell(i: Indicator): string {
  if (typeof i.value !== "number" || typeof i.prev !== "number" || i.prev === 0) return "—";
  const dlt = ((i.value - i.prev) / Math.abs(i.prev)) * 100;
  if (Math.abs(dlt) < 0.05) return "0%";
  return `${dlt > 0 ? "+" : "−"}${num(Math.abs(dlt), 1)}%`;
}

export function indicatorTable(c: Ctx, pillar: Pillar, title?: string, startNote = 1): TableBlock {
  const items = c.r.indicators.filter((x) => x.pillar === pillar);
  const footnotes: string[] = [];
  const rows = items.map((i) => {
    footnotes.push(`${i.method} Источник: ${SRC_LABEL[i.source]}; качество данных: ${QUALITY_LABEL[i.quality]}.`);
    const n = startNote + footnotes.length - 1;
    return { cells: c.hasPrev
      ? [`${i.label}${sup(n)}`, fmtVal(i.value, i.unit), fmtVal(i.prev, i.unit), changeCell(i), i.unit, `GRI ${i.gri}`]
      : [`${i.label}${sup(n)}`, fmtVal(i.value, i.unit), i.unit, `GRI ${i.gri}`] };
  });
  return {
    type: "table", title,
    columns: c.hasPrev
      ? [{ label: "Показатель", width: 40 }, { label: "Значение", width: 13 }, { label: "Пред. период", width: 13 }, { label: "Изм.", width: 8 }, { label: "Ед.", width: 14 }, { label: "Стандарт", width: 12 }]
      : [{ label: "Показатель", width: 48 }, { label: "Значение", width: 16 }, { label: "Ед.", width: 20 }, { label: "Стандарт", width: 16 }],
    rows, footnotes,
  };
}

function keyIndicators(c: Ctx): Section {
  return {
    title: "Ключевые ESG-показатели", sheet: "Показатели", blocks: [
      p(`Ниже приведены ключевые показатели за ${c.plLower}${c.hasPrev ? ` в сравнении с периодом «${c.prevPl}»` : ""}. У каждого показателя есть сноска: как он рассчитан, откуда взяты данные и насколько они надёжны («первичные данные» — счётчики и учётные документы, «расчёт» — формула из первичных данных, «оценка» — допущение, «нет данных» — показатель не заполнен).`),
      indicatorTable(c, "E", "Экологические показатели"),
      indicatorTable(c, "S", "Социальные показатели"),
      indicatorTable(c, "G", "Управленческие показатели"),
      indicatorTable(c, "EC", "Экономические показатели"),
    ],
  };
}

// ── 5. Существенность ──────────────────────────────────────────────────────

function materiality(c: Ctx): Section {
  const topics = scoreTopics(c.input.industry, c.input.materiality);
  const custom = topics.some((x) => x.custom);
  const high = topics.filter((x) => x.level === "high");
  return {
    title: "Существенные темы", sheet: "Существенность", blocks: [
      p("Существенные темы определены по принципу двойной существенности. Каждая тема оценивается по двум осям: воздействие компании на людей, общество и окружающую среду и влияние темы на финансовые результаты компании (риски и возможности). Оценки ставятся по шкале от 1 («незначимо») до 5 («критически важно»); итоговая значимость — среднее двух оценок."),
      p(custom
        ? "Оценки установлены компанией по итогам обсуждения с руководством и заинтересованными сторонами."
        : `Оценки приведены типовые для отрасли «${INDUSTRY_LABEL[c.input.industry].toLowerCase()}». Для следующего отчёта рекомендуется провести опрос сотрудников, клиентов и партнёров и скорректировать оценки на странице ESG.`),
      { type: "table", title: "Матрица существенности", columns: [
        { label: "Тема", width: 34 }, { label: "Блок", width: 8 }, { label: "Воздействие", kind: "num", width: 12 }, { label: "Фин. значимость", kind: "num", width: 13 }, { label: "Итог", kind: "num", width: 8 }, { label: "Уровень", width: 10 }, { label: "GRI / ЦУР", width: 15 },
      ], rows: topics.map((x) => ({
        cells: [x.title, x.pillar, x.impact, x.financial, x.total, LEVEL_LABEL[x.level], `${x.gri}; ${x.sdg}`],
        style: x.level === "high" ? "subtotal" : "normal",
      })) },
      p(high.length
        ? `Темы высокой значимости: ${listRu(high.map((x) => `«${x.title.toLowerCase()}»`))}. Им уделено основное внимание в разделах отчёта и в рекомендациях.`
        : "Темы высокой значимости не выявлены; все темы раскрываются в базовом объёме."),
      { type: "h3", text: "Описание тем" },
      { type: "list", items: topics.map((x) => `${x.title} — ${x.description}`) },
    ],
  };
}

// ── 6. Экология ────────────────────────────────────────────────────────────

function environment(c: Ctx): Section {
  const { r, input } = c;
  const e = r.emissions;
  const blocks: Block[] = [];

  blocks.push({ type: "h2", text: "Учёт выбросов парниковых газов" });
  blocks.push({ type: "h3", text: "Методология" });
  blocks.push(p("Инвентаризация выбросов проведена в соответствии со стандартом GHG Protocol Corporate Accounting and Reporting Standard, Руководящими указаниями МГЭИК 2006 года для национальных кадастров парниковых газов и принципами ISO 14064-1:2018. Расчёт выполнен по принципу операционного контроля: учтены 100% выбросов объектов и транспорта, которыми управляет компания."));
  blocks.push({ type: "list", items: [
    "Охват 1 — прямые выбросы от сжигания топлива на объектах компании (котельные, печи, генераторы) и в собственном автопарке.",
    "Охват 2 — косвенные выбросы от производства купленной электроэнергии и тепла. Рассчитаны по географическому методу (средний коэффициент энергосистемы).",
    "Охват 3 — прочие косвенные выбросы в цепочке создания стоимости. В отчёт включены категория 6 «Деловые поездки» и категория 7 «Поездки сотрудников на работу и обратно»; остальные категории не оценивались.",
  ] });
  blocks.push(p("Выбросы по каждому источнику рассчитаны как произведение данных о деятельности на коэффициент выбросов: Выбросы (т CO₂-экв.) = Данные о деятельности (ед.) × Коэффициент (кг CO₂ / ед.) / 1000. Приоритет отдан первичным физическим данным — литрам топлива, кВт·ч, Гкал. Учитывается диоксид углерода (CO₂): выбросы метана и закиси азота при сжигании топлива составляют, как правило, менее 1% и не рассчитывались; утечки хладагентов из кондиционеров не оценивались."));

  if (e.rows.length === 0) {
    blocks.push({ type: "callout", tone: "warn", text: "Данные о потреблении энергии и топлива не введены — таблица выбросов будет заполнена после ввода данных на странице ESG." });
  } else {
    blocks.push(emissionTable(c));
    blocks.push({ type: "h3", text: "Анализ результатов" });
    for (const t_ of emissionAnalysis(c)) blocks.push(p(t_));
    blocks.push({ type: "bars", title: "Выбросы по источникам, т CO₂-экв.", items: e.rows.filter((x) => x.scope < 3).sort((a, b) => b.t - a.t).map((x) => ({ label: x.label, value: x.t, display: `${num(x.t, 2)} т · ${pct(share(x.t, e.scope12) ?? 0)}` })) });
  }

  // energy
  blocks.push({ type: "h2", text: "Энергопотребление" });
  if (r.energy.rows.length) {
    blocks.push({ type: "table", title: "Потребление энергии по видам", columns: [
      { label: "Вид энергии", width: 40 }, { label: "Объём", kind: "num", width: 18 }, { label: "Ед.", width: 10 }, { label: "МВт·ч", kind: "num", width: 16 }, { label: "Доля", kind: "pct", width: 16 },
    ], rows: [
      ...r.energy.rows.map((x) => ({ cells: [x.label, x.amount, x.unit, x.mwh, share(x.mwh, r.energy.totalMwh)] as TableBlock["rows"][number]["cells"] })),
      { cells: ["Итого конечное потребление", null, "", r.energy.totalMwh, 100], style: "total" as const },
    ], footnotes: ["Пересчёт в МВт·ч: электроэнергия — кВт·ч / 1000; тепло — Гкал × 1,163; топливо — расход × теплотворная способность (IPCC 2006) / 3,6. Коэффициенты — в приложении «Методика и коэффициенты»."] });
    for (const t_ of energyAnalysis(c)) blocks.push(p(t_));
  } else {
    blocks.push(p(`Данные о физическом потреблении энергии не введены. По данным учёта расходы на энергию и коммунальные услуги (счета 7140, 8220) составили ${som(r.energy.cost)}.`));
  }

  // water & waste
  blocks.push({ type: "h2", text: "Водопотребление и отходы" });
  const ww: TableBlock["rows"] = [];
  if (input.waterM3 > 0) ww.push({ cells: ["Водопотребление", input.waterM3, "м³", c.prevR && c.prevR.water.m3 > 0 ? c.prevR.water.m3 : null] });
  if (input.wasteT > 0) {
    ww.push({ cells: ["Образовано отходов", input.wasteT, "т", c.prevR && c.prevR.waste.total > 0 ? c.prevR.waste.total : null] });
    ww.push({ cells: ["в т.ч. передано на переработку", input.wasteRecycledT, "т", c.prevR && c.prevR.waste.total > 0 ? c.prevR.waste.recycled : null], style: "sub" });
    if (input.hazardousWasteT > 0) ww.push({ cells: ["в т.ч. опасные отходы", input.hazardousWasteT, "т", null], style: "sub" });
  }
  if (ww.length) {
    blocks.push({ type: "table", columns: [{ label: "Показатель", width: 46 }, { label: "Значение", kind: "num", width: 18 }, { label: "Ед.", width: 12 }, { label: "Пред. период", kind: "num", width: 24 }], rows: ww });
  }
  for (const t_ of waterWasteAnalysis(c)) blocks.push(p(t_));

  // climate risks
  const risks = climateRisks(input.industry);
  blocks.push({ type: "h2", text: "Климатические риски и возможности" });
  blocks.push(p(`Проведена предварительная качественная оценка физических и переходных климатических рисков для отрасли «${INDUSTRY_LABEL[input.industry].toLowerCase()}» по трём горизонтам: краткосрочный (до 3 лет), среднесрочный (3–10 лет) и долгосрочный (10–30 лет). Для уточнения оценки рекомендуется использовать Четвёртое национальное сообщение Кыргызской Республики по Рамочной конвенции ООН об изменении климата и данные Кыргызгидромета.`));
  blocks.push({ type: "list", items: SCORE_SCALE.map((x) => `Шкала: ${x}`) });
  blocks.push({ type: "table", title: "Оценка климатических рисков", columns: [
    { label: "Тип", width: 14 }, { label: "Риск", width: 20 }, { label: "до 3 лет", kind: "num", width: 7 }, { label: "3–10 лет", kind: "num", width: 7 }, { label: "10–30 лет", kind: "num", width: 7 }, { label: "Влияние на компанию", width: 23 }, { label: "Меры", width: 22 },
  ], rows: risks.map((x) => ({ cells: [x.type, x.risk, x.scores[0], x.scores[1], x.scores[2], x.impact, x.response] })) });
  const top = [...risks].sort((a, b) => b.scores[1] - a.scores[1])[0];
  blocks.push(p(`Наиболее значимым в среднесрочной перспективе оценён риск «${top.risk.toLowerCase()}» (${top.scores[1]} из 5). Климатические возможности для компании связаны со снижением затрат на энергию, доступом к «зелёному» финансированию и спросом покупателей на продукцию с подтверждённым низким углеродным следом.`));

  return { title: "Экология", sheet: "Экология", blocks };
}

function emissionTable(c: Ctx): TableBlock {
  const { r } = c;
  const e = r.emissions;
  const prev = c.prevR?.emissions;
  const withPrev = !!prev && prev.total > 0;
  const rows: TableBlock["rows"] = [];
  const line = (label: string, cur: number, prv: number | null, total: number, style: TableBlock["rows"][number]["style"], activity = "", unit = "", factor: number | string = "") =>
    rows.push({ cells: withPrev ? [label, activity, unit, factor, prv, cur, share(cur, total)] : [label, activity, unit, factor, cur, share(cur, total)], style });
  line("Всего (Охваты 1 + 2)", e.scope12, prev?.scope12 ?? null, e.scope12, "total");
  if (e.scope3 > 0) line("Всего (Охваты 1 + 2 + 3)", e.total, prev?.total ?? null, e.total, "total");
  const scopeBlock = (scope: 1 | 2 | 3, label: string, total: number, prevTotal: number | null) => {
    const items = e.rows.filter((x) => x.scope === scope);
    if (!items.length) return;
    line(label, total, prevTotal, total, "subtotal");
    for (const x of items) {
      const pr = prev?.rows.find((y) => y.key === x.key)?.t ?? null;
      line(`${x.label}${x.factorCustom ? sup(2) : ""}`, x.t, pr, total, "sub", num(x.activity, 2), x.unit, num(x.factor, 3));
    }
  };
  scopeBlock(1, "Охват 1 — прямые выбросы", e.scope1, prev?.scope1 ?? null);
  scopeBlock(2, `Охват 2 — энергия${sup(1)}`, e.scope2, prev?.scope2 ?? null);
  scopeBlock(3, `Охват 3 — кат. 6 и 7${sup(3)}`, e.scope3, prev?.scope3 ?? null);
  return {
    type: "table",
    title: `Результаты инвентаризации выбросов ПГ, ${c.plLower}`,
    columns: withPrev
      ? [{ label: "Источник", width: 30 }, { label: "Данные", kind: "num", width: 12 }, { label: "Ед.", width: 8 }, { label: "Коэф., кг/ед.", width: 11 }, { label: "Пред., т", kind: "num", width: 13 }, { label: "Тек., т", kind: "num", width: 13 }, { label: "Доля", kind: "pct", width: 9 }]
      : [{ label: "Источник", width: 34 }, { label: "Данные", kind: "num", width: 15 }, { label: "Ед.", width: 9 }, { label: "Коэф., кг/ед.", width: 13 }, { label: "т CO₂-экв.", kind: "num", width: 16 }, { label: "Доля", kind: "pct", width: 9 }],
    rows,
    footnotes: [
      `Охват 2 рассчитан по географическому методу: электроэнергия — ${num(c.input.gridFactor, 3)} кг CO₂/кВт·ч (${GRID.source}); тепло — ${num(c.input.heatFactor, 1)} кг CO₂/Гкал. Данных о рыночных инструментах (сертификатах происхождения) нет, поэтому рыночный метод даёт тот же результат.`,
      "Коэффициент задан компанией вместо значения по умолчанию.",
      "Охват 3 оценён частично: категория 7 — по средней дальности поездки и доле видов транспорта; категория 6 — по пассажиро-километрам командировок. Категории 1–5 и 8–15 не оценивались.",
      "Доля — от итога соответствующего охвата; для строк «Всего» — 100%.",
    ],
  };
}

function emissionAnalysis(c: Ctx): string[] {
  const e = c.r.emissions;
  const out: string[] = [];
  const s1Parts = [{ k: "стационарные источники", v: e.stationary }, { k: "автопарк", v: e.mobile }].filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  if (e.scope1 > 0) {
    const top = c.r.emissions.rows.filter((x) => x.scope === 1).sort((a, b) => b.t - a.t)[0];
    out.push(`Выбросы Охвата 1 составили ${t(e.scope1)} (${pct(share(e.scope1, e.scope12) ?? 0)} от Охватов 1+2). ${s1Parts.length > 1 ? `На ${s1Parts[0].k} приходится ${pct(share(s1Parts[0].v, e.scope1) ?? 0)}, на ${s1Parts[1].k} — ${pct(share(s1Parts[1].v, e.scope1) ?? 0)}.` : `Все они приходятся на ${s1Parts[0].k}.`} Крупнейший источник — «${top.label.toLowerCase()}»: ${t(top.t)}.`);
  } else {
    out.push("Выбросов Охвата 1 нет: компания не сжигает топливо на своих объектах и не имеет собственного автопарка (или данные о них не введены).");
  }
  if (e.scope2 > 0) {
    out.push(`Выбросы Охвата 2 составили ${t(e.scope2)} (${pct(share(e.scope2, e.scope12) ?? 0)} от Охватов 1+2)${e.heat > 0 ? `: электроэнергия — ${t(e.electricity)} (${pct(share(e.electricity, e.scope2) ?? 0)}), тепло — ${t(e.heat)}` : ", все — от электроэнергии"}. Электроэнергетика Кыргызстана в основном гидрогенерационная, поэтому коэффициент сети (${num(c.input.gridFactor, 3)} кг/кВт·ч) ниже, чем в странах с угольной генерацией; при этом в зимний период доля ТЭЦ растёт.`);
  }
  if (c.prevR && c.prevR.emissions.scope12 > 0) {
    const pe = c.prevR.emissions;
    const drivers = [
      { k: "электроэнергия", d: e.electricity - pe.electricity }, { k: "тепло", d: e.heat - pe.heat },
      { k: "стационарное сжигание", d: e.stationary - pe.stationary }, { k: "автопарк", d: e.mobile - pe.mobile },
    ].filter((x) => Math.abs(x.d) > 0.005).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    out.push(`По сравнению с периодом «${c.prevPl}» выбросы Охватов 1+2 ${change(e.scope12, pe.scope12, { plural: true, unit: "т", d: 2 })}.${drivers.length ? ` Основной вклад в изменение внесла статья «${drivers[0].k}» (${drivers[0].d > 0 ? "+" : "−"}${num(Math.abs(drivers[0].d), 2)} т).` : ""}`);
  }
  const intens: string[] = [];
  if (e.perMlnRevenue !== null) intens.push(`${num(e.perMlnRevenue, 3)} т CO₂-экв. на 1 млн сом выручки`);
  if (e.perEmployee !== null) intens.push(`${num(e.perEmployee, 3)} т CO₂-экв. на одного сотрудника`);
  if (intens.length) out.push(`Удельные показатели (углеродоёмкость, GRI 305-4) по Охватам 1+2: ${listRu(intens)}. Удельные показатели позволяют сравнивать периоды с разным объёмом деятельности и компании разного размера в одной отрасли.`);
  if (e.scope3 > 0) out.push(`Оценка Охвата 3 составила ${t(e.scope3)}: поездки сотрудников на работу — ${t(e.commute)}, деловые поездки — ${t(e.travel)}. Это частичная оценка; для полного Охвата 3 нужны данные о закупках и цепочке поставок.`);
  if (c.input.emissionTargetPct > 0) {
    out.push(`Компания поставила цель сократить выбросы Охватов 1+2 на ${pct(c.input.emissionTargetPct, 0)}${c.input.emissionTargetYear ? ` к ${c.input.emissionTargetYear} году` : ""} относительно базового уровня. Целевой уровень для периода такой же продолжительности — ${t(e.scope12 * (1 - c.input.emissionTargetPct / 100))}.`);
  } else {
    out.push("Количественная цель по сокращению выбросов пока не установлена (см. раздел «Рекомендации»).");
  }
  return out;
}

function energyAnalysis(c: Ctx): string[] {
  const en = c.r.energy;
  const out: string[] = [];
  const top = [...en.rows].sort((a, b) => b.mwh - a.mwh)[0];
  out.push(`Совокупное конечное потребление энергии составило ${num(en.totalMwh, 2)} МВт·ч, из них ${num(en.gridMwh, 2)} МВт·ч — купленные электроэнергия и тепло, ${num(en.fuelMwh, 2)} МВт·ч — топливо. Наибольшая доля приходится на «${top.label.toLowerCase()}» (${pct(share(top.mwh, en.totalMwh) ?? 0)}).`);
  if (en.cost > 0) out.push(`Расходы на энергию и коммунальные услуги по данным учёта — ${som(en.cost)}${en.costPerMwh !== null ? `, или около ${som(en.costPerMwh)} на 1 МВт·ч купленной энергии (с учётом прочих коммунальных услуг)` : ""}.`);
  if (en.perMlnRevenue !== null) out.push(`Энергоёмкость выручки — ${num(en.perMlnRevenue, 2)} МВт·ч на 1 млн сом (GRI 302-3).${c.prevR && c.prevR.energy.perMlnRevenue ? ` Показатель ${change(en.perMlnRevenue, c.prevR.energy.perMlnRevenue, { d: 2 })}.` : ""}`);
  out.push(en.renewableShare && en.renewableShare > 0
    ? `Доля документально подтверждённой возобновляемой электроэнергии — ${pct(en.renewableShare)}.`
    : "Документально подтверждённая электроэнергия из возобновляемых источников в отчётном периоде не потреблялась. Гидроэнергия в общей сети учтена в среднем коэффициенте энергосистемы и не считается ВИЭ компании.");
  return out;
}

function waterWasteAnalysis(c: Ctx): string[] {
  const { input, r } = c;
  const out: string[] = [];
  if (input.waterM3 > 0) {
    out.push(`Водопотребление составило ${num(input.waterM3, 1)} м³${r.water.perEmployee !== null ? ` (${num(r.water.perEmployee, 2)} м³ на сотрудника)` : ""}. Вода забирается из централизованных систем водоснабжения; водопотребление приравнено к водозабору.${c.prevR && c.prevR.water.m3 > 0 ? ` Объём ${change(input.waterM3, c.prevR.water.m3, { unit: "м³" })}.` : ""}`);
  } else {
    out.push("Данные о водопотреблении не введены. Рекомендуется ежемесячно снимать показания водомеров.");
  }
  if (input.wasteT > 0) {
    out.push(`Образовано ${num(input.wasteT, 2)} т отходов, из них ${num(input.wasteRecycledT, 2)} т (${pct(r.waste.recycledShare ?? 0)}) передано на переработку${input.hazardousWasteT > 0 ? `, ${num(input.hazardousWasteT, 2)} т отнесены к опасным и переданы специализированным организациям` : ""}. Остальные отходы вывезены на полигон по договору со специализированной организацией.`);
  } else {
    out.push("Данные об образовании отходов не введены. Рекомендуется сохранять акты вывоза с указанием массы и вида отходов.");
  }
  return out;
}

// ── 7. Социальная сфера ────────────────────────────────────────────────────

function social(c: Ctx): Section {
  const { r, input } = c;
  const w = r.workforce;
  const blocks: Block[] = [];
  blocks.push({ type: "h2", text: "Профиль персонала" });
  if (w.end > 0) {
    blocks.push({ type: "table", columns: [{ label: "Показатель", width: 52 }, { label: "Значение", width: 24 }, { label: "Доля", width: 24 }], rows: [
      { cells: ["Численность на конец периода", `${num(w.end, 0)} чел.`, "100%"], style: "subtotal" },
      { cells: ["женщины", `${num(w.women, 0)} чел.`, pct(w.womenShare)], style: "sub" },
      { cells: ["мужчины", `${num(Math.max(0, w.end - w.women), 0)} чел.`, pct(w.womenShare === null ? null : 100 - w.womenShare)], style: "sub" },
      ...(input.under30 + input.age30to50 + input.over50 > 0 ? [
        { cells: ["до 30 лет", `${num(input.under30, 0)} чел.`, pct(w.ageShares.under30)], style: "sub" as const },
        { cells: ["30–50 лет", `${num(input.age30to50, 0)} чел.`, pct(w.ageShares.age30to50)], style: "sub" as const },
        { cells: ["старше 50 лет", `${num(input.over50, 0)} чел.`, pct(w.ageShares.over50)], style: "sub" as const },
      ] : []),
      { cells: ["Руководители", `${num(w.managers, 0)} чел.`, w.managers ? `женщин ${pct(w.womenManagersShare)}` : "—"] },
      { cells: ["Работники по договорам ГПХ", `${num(w.contractors, 0)} чел.`, "—"] },
      { cells: ["Принято за период", `${num(w.hires, 0)} чел.`, w.hireRate !== null ? `${pct(w.hireRate)} среднесписочной` : "—"] },
      { cells: ["Уволилось за период", `${num(w.leavers, 0)} чел.`, w.turnover !== null ? `текучесть ${pct(w.turnover)}` : "—"] },
    ] });
    let text = `На конец периода в компании работало ${num(w.end, 0)} ${plural(w.end, ["человек", "человека", "человек"])}${w.start > 0 ? `, на начало — ${num(w.start, 0)}; среднесписочная численность — ${num(w.avg, 1)}` : ""}.`;
    if (w.womenShare !== null) text += ` Женщины составляют ${pct(w.womenShare)} персонала${w.womenManagersShare !== null ? ` и ${pct(w.womenManagersShare)} руководителей` : ""}.`;
    if (w.turnover !== null) text += ` Текучесть кадров за период — ${pct(w.turnover)}${r.months < 12 ? ` (около ${pct((w.turnover * 12) / r.months, 0)} в пересчёте на год)` : ""}.`;
    if (w.contractors > 0) text += ` Дополнительно по гражданско-правовым договорам привлечено ${num(w.contractors, 0)} ${plural(w.contractors, ["человек", "человека", "человек"])}.`;
    blocks.push(p(text));
  } else {
    blocks.push(p("Данные о численности персонала не введены — относительные социальные показатели не рассчитаны."));
  }

  blocks.push({ type: "h2", text: "Оплата труда и социальные гарантии" });
  blocks.push(p(`Фонд оплаты труда за период составил ${som(r.pay.payroll)}${r.pay.payrollShareOfCosts !== null ? ` — ${pct(r.pay.payrollShareOfCosts)} всех расходов компании` : ""}. ${r.pay.avgWage !== null ? `Средняя начисленная зарплата — ${som(r.pay.avgWage)} в месяц${r.pay.toNational !== null ? `, что составляет ${pct(r.pay.toNational)} от средней по стране (${som(input.nationalAvgWage)})` : ""}.` : ""}`.trim()));
  blocks.push(p(`Компания начисляет страховые взносы в Социальный фонд КР по ставке 2,25% за счёт работодателя и удерживает 10% взносов и 10% подоходного налога из зарплаты работников. Взносы работодателя за период — ${som(r.pay.social)}. Все работники оформлены официально; зарплата выплачивается безналичным путём или через кассу с отражением в учёте.`));

  blocks.push({ type: "h2", text: "Обучение и развитие" });
  blocks.push(p(r.training.hours > 0
    ? `За период проведено ${num(r.training.hours, 0)} ${plural(r.training.hours, ["час", "часа", "часов"])} обучения — ${num(r.training.perEmployee ?? 0)} ч на сотрудника${r.training.trainedShare !== null && input.employeesTrained > 0 ? `; обучение прошли ${pct(r.training.trainedShare)} работников` : ""}. ${r.training.spend > 0 ? `Расходы на обучение (счёт 8160) — ${som(r.training.spend)}, или ${som(r.training.spendPerEmployee)} на сотрудника.` : "Обучение проводилось силами компании, отдельных расходов по счёту 8160 нет."}`
    : `Часы обучения за период не учитывались.${r.training.spend > 0 ? ` Расходы на обучение по счёту 8160 — ${som(r.training.spend)}.` : ""}`));

  blocks.push({ type: "h2", text: "Охрана труда и здоровья" });
  blocks.push(p(input.injuries > 0
    ? `За период зарегистрировано ${num(input.injuries, 0)} ${plural(input.injuries, ["несчастный случай", "несчастных случая", "несчастных случаев"])} с потерей трудоспособности (${num(input.lostDays, 0)} дн. нетрудоспособности). Коэффициент травматизма LTIFR — ${num(r.safety.ltifr ?? 0, 2)} на 1 млн отработанных человеко-часов.`
    : `Несчастных случаев с потерей трудоспособности за период не зарегистрировано; коэффициент травматизма LTIFR равен нулю при ${num(r.safety.hoursWorked, 0)} ${r.safety.hoursEstimated ? "(оценочно) " : ""}отработанных человеко-часах.`));

  blocks.push({ type: "h2", text: "Права человека и равные возможности" });
  const hr = r.governance.policies.find((x) => x.key === "hrPolicy");
  blocks.push(p(`${input.discriminationCases > 0 ? `За период рассмотрено ${num(input.discriminationCases, 0)} ${plural(input.discriminationCases, ["обращение", "обращения", "обращений"])} о дискриминации.` : "Случаев дискриминации за период не зафиксировано."} ${hr?.adopted ? "В компании утверждена кадровая политика, закрепляющая равные возможности при найме, оплате и продвижении." : "Кадровая политика с принципами равных возможностей пока не утверждена."} Компания не использует детский и принудительный труд.`));
  return { title: "Социальная сфера", sheet: "Социальная сфера", blocks };
}

// ── 8. Управление ──────────────────────────────────────────────────────────

function governance(c: Ctx): Section {
  const { r, input, d } = c;
  const g = r.governance, tx = r.tax;
  const blocks: Block[] = [];
  blocks.push({ type: "h2", text: "Корпоративное управление" });
  blocks.push(p(g.boardMembers > 0
    ? `Высший орган управления состоит из ${num(g.boardMembers, 0)} ${plural(g.boardMembers, ["члена", "членов", "членов"])}${g.independentShare !== null ? `, доля независимых — ${pct(g.independentShare)}` : ""}${g.womenBoardShare !== null ? `, доля женщин — ${pct(g.womenBoardShare)}` : ""}. ${input.esgOwner.trim() ? `Вопросы устойчивого развития курирует ${input.esgOwner.trim()}.` : "Ответственный за вопросы устойчивого развития не назначен."}`
    : "Данные о составе органа управления не введены."));

  blocks.push({ type: "h2", text: "Деловая этика и противодействие коррупции" });
  blocks.push({ type: "table", title: "Политики компании", columns: [{ label: "Документ", width: 70 }, { label: "Статус", width: 30 }],
    rows: g.policies.map((x) => ({ cells: [x.label, x.adopted ? "утверждена" : "не утверждена"] })) });
  blocks.push(p(`${g.corruptionCases > 0 ? `Подтверждено ${num(g.corruptionCases, 0)} ${plural(g.corruptionCases, ["случай", "случая", "случаев"])} коррупции; по каждому приняты меры.` : "Подтверждённых случаев коррупции за период нет."} ${g.customerComplaints > 0 ? `Получено ${num(g.customerComplaints, 0)} ${plural(g.customerComplaints, ["жалоба", "жалобы", "жалоб"])} клиентов.` : ""}`.trim()));

  blocks.push({ type: "h2", text: "Налоги" });
  blocks.push({ type: "table", columns: [{ label: "Показатель", width: 64 }, { label: "Сумма, сом", kind: "money", width: 36 }], rows: [
    { cells: ["Налог на прибыль / единый налог / патент (счёт 9910)", tx.profitTax] },
    { cells: ["Налог с продаж и прочие налоги в расходах (8190)", tx.turnoverTaxes] },
    ...(tx.propertyTax ? [{ cells: ["Налог на имущество (8050)", tx.propertyTax] as TableBlock["rows"][number]["cells"] }] : []),
    ...(tx.vatNotDeductible ? [{ cells: ["НДС, не принимаемый к зачёту (8100)", tx.vatNotDeductible] as TableBlock["rows"][number]["cells"] }] : []),
    { cells: ["Страховые взносы работодателя", r.pay.social] },
    { cells: ["Перечислено в бюджет за период (погашение 3400)", tx.paidToBudget], style: "subtotal" },
    { cells: ["Перечислено в Социальный фонд (погашение 3530)", tx.paidSocialFund], style: "subtotal" },
    ...(tx.vatOutput ? [{ cells: ["НДС, начисленный с реализации (3430)", tx.vatOutput] as TableBlock["rows"][number]["cells"] }] : []),
  ], footnotes: ["Перечисления включают удержанные из зарплаты подоходный налог и взносы работников — компания уплачивает их как налоговый агент."] });
  blocks.push(p(`Компания применяет налоговый режим «${d.company.regimeName}». Налоговая нагрузка (налоги в расходах и взносы работодателя к выручке) составила ${pct(tx.burdenPct ?? 0, 2)}. ${tx.finesBudget > 0 ? `За период начислены штрафы и пени в бюджет на ${som(tx.finesBudget)} (счёт 8230).` : "Штрафов и пеней в бюджет за период не начислено."}${tx.penaltiesContract > 0 ? ` Отдельно начислены неустойки по хозяйственным договорам — ${som(tx.penaltiesContract)} (счёт 8240); они не являются нарушением законодательства.` : ""}`));

  blocks.push({ type: "h2", text: "Закупки и поставщики" });
  blocks.push(p(g.localSuppliersPct > 0
    ? `Доля закупок у поставщиков, зарегистрированных в Кыргызской Республике, — около ${pct(g.localSuppliersPct, 0)}. Закупки у местных поставщиков поддерживают занятость в регионе и сокращают транспортные выбросы.`
    : "Доля закупок у местных поставщиков не оценивалась."));

  blocks.push({ type: "h2", text: "Защита данных и качество отчётности" });
  const okChecks = d.statements.checks.filter((x) => x.status === "ok").length;
  blocks.push(p(`${g.dataBreaches > 0 ? `Зафиксировано ${num(g.dataBreaches, 0)} ${plural(g.dataBreaches, ["инцидент", "инцидента", "инцидентов"])} с утечкой персональных данных.` : "Утечек персональных данных не зафиксировано."} ${g.policies.find((x) => x.key === "dataProtectionPolicy")?.adopted ? "Политика защиты персональных данных утверждена." : "Политика защиты персональных данных не утверждена."} Финансовая отчётность, на которой основаны денежные показатели ESG-отчёта, проходит ${okChecks} из ${d.statements.checks.length} автоматических сверок между формами (баланс, отчёт о прибылях и убытках, движение денежных средств, капитал, налоги).`));
  return { title: "Управление", sheet: "Управление", blocks };
}

// ── 9. Экономическая стоимость ─────────────────────────────────────────────

function economic(c: Ctx): Section {
  const ev = c.r.economic;
  const prev = c.prevR?.economic;
  const withPrev = !!prev && prev.generated > 0;
  const row = (label: string, v: number, pv: number | undefined, style?: TableBlock["rows"][number]["style"]) =>
    ({ cells: withPrev ? [label, v, pv ?? null, share(v, ev.generated)] : [label, v, share(v, ev.generated)], style });
  return {
    title: "Созданная и распределённая экономическая стоимость", sheet: "GRI 201-1", blocks: [
      p("Показатель GRI 201-1 показывает, сколько стоимости создала компания и как она распределилась между заинтересованными сторонами: поставщиками, работниками, кредиторами и собственниками, государством и местным сообществом. Расчёт выполнен по методу начисления на данных журнала проводок."),
      { type: "table", columns: withPrev
        ? [{ label: "Статья", width: 48 }, { label: "Текущий, сом", kind: "money", width: 18 }, { label: "Предыдущий, сом", kind: "money", width: 18 }, { label: "Доля", kind: "pct", width: 16 }]
        : [{ label: "Статья", width: 56 }, { label: "Сумма, сом", kind: "money", width: 24 }, { label: "Доля", kind: "pct", width: 20 }],
        rows: [
          row("Создано: выручка и прочие доходы", ev.generated, prev?.generated, "subtotal"),
          row("Операционные затраты (поставщики)", ev.operatingCosts, prev?.operatingCosts),
          row("Работникам: зарплата и взносы работодателя", ev.employees, prev?.employees),
          row("Кредиторам и собственникам: проценты и объявленные дивиденды", ev.capitalProviders, prev?.capitalProviders),
          row("Государству: налоги и штрафы в бюджет", ev.government, prev?.government),
          row("Сообществу: благотворительность и социальные проекты", ev.community, prev?.community),
          row("Распределено всего", ev.distributed, prev?.distributed, "subtotal"),
          row("Осталось в компании", ev.retained, prev?.retained, "total"),
        ],
        footnotes: [
          "Операционные затраты — все расходы периода за вычетом зарплаты, взносов, налогов, штрафов в бюджет, процентов, амортизации (не денежный поток к стороннему получателю) и благотворительности.",
          "Остаток в компании = чистая прибыль + амортизация − объявленные дивиденды.",
        ] },
      p(`Из ${mln(ev.generated)} созданной стоимости ${pct(share(ev.operatingCosts, ev.generated) ?? 0)} направлено поставщикам товаров и услуг, ${pct(share(ev.employees, ev.generated) ?? 0)} — работникам, ${pct(share(ev.government, ev.generated) ?? 0)} — государству, ${pct(share(ev.capitalProviders, ev.generated) ?? 0)} — кредиторам и собственникам. В компании для развития осталось ${mln(ev.retained)} (${pct(share(ev.retained, ev.generated) ?? 0)}).`),
    ],
  };
}

// ── 10. Рекомендации ───────────────────────────────────────────────────────

function recommendationsSection(c: Ctx): Section {
  const blocks: Block[] = [
    p("Рекомендации сформированы на основе показателей отчёта. Для каждой указано обоснование на цифрах компании, практические шаги, ожидаемый эффект (расчёт на данных компании, если его можно посчитать), показатель для контроля и срок."),
    { type: "table", title: "Сводный план", columns: [{ label: "Приоритет", width: 12 }, { label: "Блок", width: 7 }, { label: "Рекомендация", width: 37 }, { label: "Срок", width: 18 }, { label: "Показатель контроля", width: 26 }],
      rows: c.recs.map((x) => ({ cells: [x.priority, x.pillar, x.title, x.horizon, x.kpi], style: x.priority === "Высокий" ? "subtotal" : "normal" })) },
  ];
  c.recs.forEach((x, i) => {
    blocks.push({ type: "h3", text: `${i + 1}. ${x.title}` });
    blocks.push(p(`Почему: ${x.why}`));
    blocks.push({ type: "list", items: x.actions });
    blocks.push(p(`Ожидаемый эффект: ${x.effect}`));
    blocks.push(p(`Контроль: ${x.kpi}. Срок: ${x.horizon}. Связанные раскрытия: GRI ${x.gri}.`));
  });
  if (!c.recs.length) blocks.push(p("Существенных зон для улучшения по данным отчёта не выявлено."));
  return { title: "Рекомендации", sheet: "Рекомендации", blocks };
}

// ── 11. Методика ───────────────────────────────────────────────────────────

function methodology(c: Ctx): Section {
  const fuelRows = (Object.values(FUELS) as Fuel[]).map((f) => ({
    cells: [f.label, `${num(f.co2PerTj, 0)} кг/ТДж`, `${num(f.ncv, 1)} ГДж/т`, f.densityNote ?? "—", `${num(gjPerUnit(f), 4)} ГДж/${f.unit}`, `${num(kgCo2PerUnit(f), 3)} кг/${f.unit}`] as TableBlock["rows"][number]["cells"],
  }));
  const used = (k: keyof typeof DEFAULT_FACTORS, unit: string, src: string) => {
    const v = k === "coalFactor" && !(c.input.coalFactor > 0) ? kgCo2PerUnit(FUELS[c.input.coalType]) : Number(c.input[k]);
    const custom = k === "coalFactor" ? c.input.coalFactor > 0 : Math.abs(v - DEFAULT_FACTORS[k]) > 1e-6;
    return { cells: [unit, num(v, 3), custom ? "задан компанией" : src] as TableBlock["rows"][number]["cells"] };
  };
  return {
    title: "Приложение 1. Методика и коэффициенты", sheet: "Методика", blocks: [
      p("В приложении приведены все коэффициенты, использованные в расчётах, их вывод и источники, а также методика каждого показателя. Повторив расчёт по этим данным, можно получить те же значения."),
      { type: "table", title: "Коэффициенты, применённые в отчёте", columns: [{ label: "Источник выбросов", width: 30 }, { label: "Коэффициент, кг CO₂-экв./ед.", width: 20 }, { label: "Источник коэффициента", width: 50 }], rows: [
        used("gridFactor", "Электроэнергия, кВт·ч", GRID.source),
        used("heatFactor", "Тепловая энергия, Гкал", HEAT.source),
        used("dieselFactor", "Дизельное топливо, л", "IPCC 2006 (см. таблицу ниже)"),
        used("petrolFactor", "Бензин, л", "IPCC 2006 (см. таблицу ниже)"),
        used("gasFactor", "Природный газ, м³", "IPCC 2006 (см. таблицу ниже)"),
        used("coalFactor", `${FUELS[c.input.coalType].label}, т`, "IPCC 2006 (см. таблицу ниже)"),
        used("carFactor", "Автомобиль, км", TRANSPORT.car.source),
        used("busFactor", "Общественный транспорт, пасс.-км", TRANSPORT.bus.source),
        used("airFactor", "Авиаперелёт, пасс.-км", TRANSPORT.air.source),
        used("railFactor", "Железная дорога, пасс.-км", TRANSPORT.rail.source),
      ] },
      { type: "table", title: "Вывод коэффициентов для топлива (IPCC 2006, т. 2, гл. 1, табл. 1.2 и 1.4)", columns: [
        { label: "Топливо", width: 22 }, { label: "CO₂", width: 13 }, { label: "Теплотворн. способн.", width: 15 }, { label: "Плотность", width: 16 }, { label: "Энергия", width: 16 }, { label: "Коэффициент", width: 18 },
      ], rows: fuelRows, footnotes: ["Энергия на единицу = теплотворная способность × масса единицы; коэффициент = выбросы CO₂ на ТДж × энергия на единицу. Плотности — типичные значения (допущение)."] },
      { type: "table", title: "Методика показателей", columns: [{ label: "Показатель", width: 30 }, { label: "Как рассчитан", width: 56 }, { label: "Стандарт", width: 14 }],
        rows: c.r.indicators.map((i) => ({ cells: [i.label, i.method, `GRI ${i.gri}`] })) },
      { type: "h3", text: "Ограничения" },
      { type: "list", items: [
        "Учитывается только CO₂; метан, закись азота и фторсодержащие газы не рассчитывались.",
        "Охват 3 оценён частично (категории 6 и 7).",
        "Климатические риски оценены качественно по типовым рискам отрасли, без сценарного количественного моделирования.",
        "Нефинансовые данные предоставлены компанией и не проходили внешнюю проверку.",
        ...c.r.gaps.map((g) => `Нет данных: ${g}.`),
      ] },
    ],
  };
}

// ── 12. Указатель GRI ──────────────────────────────────────────────────────

function griIndex(c: Ctx): Section {
  const { r, input } = c;
  const st = (ok: boolean, partial = false) => (ok ? "раскрыто" : partial ? "частично" : "не раскрыто");
  const rows: Array<[string, string, string, string]> = [
    ["GRI 2-1", "Сведения об организации", "О компании и об отчёте", st(true)],
    ["GRI 2-2", "Субъекты, включённые в отчётность", "О компании и об отчёте", st(true)],
    ["GRI 2-3", "Отчётный период и периодичность", "О компании и об отчёте", st(true)],
    ["GRI 2-4", "Пересчёт информации", "О компании и об отчёте", st(true)],
    ["GRI 2-5", "Внешнее заверение", "О компании и об отчёте", "раскрыто (заверение не проводилось)"],
    ["GRI 2-6", "Деятельность и цепочка создания стоимости", "О компании и об отчёте", st(!!input.companyDescription.trim(), true)],
    ["GRI 2-7", "Работники", "Социальная сфера", st(r.workforce.end > 0)],
    ["GRI 2-8", "Работники, не являющиеся сотрудниками", "Социальная сфера", st(r.workforce.end > 0)],
    ["GRI 2-9", "Структура и состав органов управления", "Управление", st(input.boardMembers > 0)],
    ["GRI 2-13", "Ответственность за управление воздействиями", "Управление", st(!!input.esgOwner.trim())],
    ["GRI 2-22", "Заявление о стратегии устойчивого развития", "Обращение руководителя", st(!!input.ceoMessage.trim(), true)],
    ["GRI 2-23", "Политики", "Управление", st(r.governance.policies.every((x) => x.adopted), r.governance.policies.some((x) => x.adopted))],
    ["GRI 2-27", "Соблюдение законодательства", "Управление", st(true)],
    ["GRI 3-1", "Процесс определения существенных тем", "Существенные темы", st(true)],
    ["GRI 3-2", "Перечень существенных тем", "Существенные темы", st(true)],
    ["GRI 201-1", "Созданная и распределённая экономическая стоимость", "Экономическая стоимость", st(true)],
    ["GRI 201-2", "Финансовые последствия изменения климата", "Экология: климатические риски", st(false, true)],
    ["GRI 202-1", "Отношение зарплаты к средней по стране", "Социальная сфера", st(r.pay.toNational !== null, r.pay.avgWage !== null)],
    ["GRI 204-1", "Доля закупок у местных поставщиков", "Управление", st(input.localSuppliersPct > 0)],
    ["GRI 205-2", "Информирование о противодействии коррупции", "Управление", st(input.antiCorruptionPolicy, false)],
    ["GRI 205-3", "Подтверждённые случаи коррупции", "Управление", st(true)],
    ["GRI 207-1", "Подход к налогообложению", "Управление: налоги", st(true)],
    ["GRI 207-4", "Налоги по странам", "Управление: налоги", st(true)],
    ["GRI 302-1", "Потребление энергии внутри организации", "Экология: энергопотребление", st(r.energy.totalMwh > 0)],
    ["GRI 302-3", "Энергоёмкость", "Экология: энергопотребление", st(r.energy.perMlnRevenue !== null && r.energy.totalMwh > 0)],
    ["GRI 303-5", "Водопотребление", "Экология: вода и отходы", st(input.waterM3 > 0)],
    ["GRI 305-1", "Прямые выбросы ПГ (Охват 1)", "Экология: учёт выбросов", st(r.emissions.rows.some((x) => x.scope === 1) || r.emissions.scope2 > 0)],
    ["GRI 305-2", "Косвенные энергетические выбросы (Охват 2)", "Экология: учёт выбросов", st(r.emissions.scope2 > 0)],
    ["GRI 305-3", "Прочие косвенные выбросы (Охват 3)", "Экология: учёт выбросов", st(false, r.emissions.scope3 > 0)],
    ["GRI 305-4", "Интенсивность выбросов", "Экология: учёт выбросов", st(r.emissions.perMlnRevenue !== null && r.emissions.scope12 > 0)],
    ["GRI 305-5", "Сокращение выбросов", "Рекомендации", st(input.emissionTargetPct > 0, true)],
    ["GRI 306-3", "Образовавшиеся отходы", "Экология: вода и отходы", st(input.wasteT > 0)],
    ["GRI 306-4", "Отходы, направленные на переработку", "Экология: вода и отходы", st(input.wasteT > 0)],
    ["GRI 401-1", "Найм и текучесть", "Социальная сфера", st(r.workforce.turnover !== null)],
    ["GRI 403-9", "Производственный травматизм", "Социальная сфера", st(r.workforce.end > 0 && !r.safety.hoursEstimated, r.workforce.end > 0)],
    ["GRI 404-1", "Часы обучения на сотрудника", "Социальная сфера", st(input.trainingHours > 0)],
    ["GRI 405-1", "Разнообразие органов управления и персонала", "Социальная сфера; Управление", st(r.workforce.womenShare !== null && input.boardMembers > 0, r.workforce.womenShare !== null)],
    ["GRI 406-1", "Случаи дискриминации", "Социальная сфера", st(true)],
    ["GRI 418-1", "Нарушения конфиденциальности данных клиентов", "Управление", st(true)],
  ];
  const disclosed = rows.filter((x) => x[3].startsWith("раскрыто")).length;
  return {
    title: "Приложение 2. Указатель стандартов GRI", sheet: "Указатель GRI", blocks: [
      p(`Отчёт подготовлен с учётом Стандартов GRI в редакции 2021 года (GRI 1: Foundation 2021). Полностью раскрыто ${disclosed} из ${rows.length} показателей; статус «частично» означает, что раскрыта часть требований или использованы оценочные данные.`),
      { type: "table", columns: [{ label: "Код", width: 12 }, { label: "Раскрытие", width: 40 }, { label: "Раздел отчёта", width: 30 }, { label: "Статус", width: 18 }],
        rows: rows.map((x) => ({ cells: x, style: x[3] === "не раскрыто" ? "sub" : "normal" })) },
    ],
  };
}

// ── 13. IFRS S1 / S2 ───────────────────────────────────────────────────────

function ifrs(c: Ctx): Section {
  const s2: Array<[string, string, string, string]> = [
    ["Governance (а)", "Надзор органа управления за климатическими рисками", "Управление: корпоративное управление", c.input.boardMembers > 0 ? "частично" : "не раскрыто"],
    ["Governance (б)", "Роль руководства", "Управление; Об отчёте", c.input.esgOwner.trim() ? "раскрыто" : "не раскрыто"],
    ["Strategy (а)", "Климатические риски и возможности", "Экология: климатические риски", "раскрыто"],
    ["Strategy (б)", "Влияние на бизнес-модель и цепочку стоимости", "Экология: климатические риски", "частично"],
    ["Strategy (в)", "Устойчивость стратегии, анализ сценариев", "—", "не раскрыто"],
    ["Risk management (а)", "Процесс выявления и оценки климатических рисков", "Экология: климатические риски", "частично"],
    ["Risk management (б, в)", "Управление рисками и интеграция в общую систему", "Рекомендации", "частично"],
    ["Metrics (а)", "Выбросы ПГ Охватов 1, 2, 3", "Экология: учёт выбросов", c.r.emissions.scope12 > 0 ? (c.r.emissions.scope3 > 0 ? "частично (Охват 3 — 2 категории)" : "частично (без Охвата 3)") : "не раскрыто"],
    ["Metrics (б)", "Отраслевые метрики и интенсивность", "Экология: учёт выбросов, энергопотребление", c.r.emissions.scope12 > 0 ? "раскрыто" : "не раскрыто"],
    ["Targets", "Климатические цели и прогресс", "Экология: учёт выбросов", c.input.emissionTargetPct > 0 ? "раскрыто" : "не раскрыто"],
  ];
  const s1: Array<[string, string, string]> = [
    ["Общие требования, границы отчётности", "О компании и об отчёте", "раскрыто"],
    ["Управление (Governance)", "Управление", c.input.esgOwner.trim() ? "частично" : "не раскрыто"],
    ["Стратегия: риски и возможности устойчивого развития", "Существенные темы; Экология", "частично"],
    ["Управление рисками", "Рекомендации; Экология", "частично"],
    ["Метрики и цели", "Ключевые ESG-показатели", "раскрыто"],
    ["Связь с финансовой отчётностью", "О компании и об отчёте; Экономическая стоимость", "раскрыто"],
    ["Сопоставимость", "Ключевые ESG-показатели", c.hasPrev ? "раскрыто" : "частично (базовый период)"],
  ];
  return {
    title: "Приложение 3. Соответствие IFRS S1 и IFRS S2", sheet: "IFRS S1 S2", blocks: [
      p("Таблицы показывают, в каких разделах отчёта раскрыты требования стандартов Совета по международным стандартам устойчивого развития (ISSB): IFRS S1 «Общие требования к раскрытию информации, связанной с устойчивым развитием» и IFRS S2 «Раскрытие информации, связанной с климатом» (2023)."),
      { type: "table", title: "IFRS S1", columns: [{ label: "Требование", width: 44 }, { label: "Раздел отчёта", width: 36 }, { label: "Статус", width: 20 }], rows: s1.map((x) => ({ cells: x })) },
      { type: "table", title: "IFRS S2", columns: [{ label: "Пункт", width: 18 }, { label: "Требование", width: 34 }, { label: "Раздел отчёта", width: 28 }, { label: "Статус", width: 20 }], rows: s2.map((x) => ({ cells: x })) },
    ],
  };
}

// ── 14. Термины ────────────────────────────────────────────────────────────

function glossary(): Section {
  const terms: Array<[string, string]> = [
    ["ESG", "Environmental, Social, Governance — экологические, социальные и управленческие факторы деятельности компании."],
    ["GRI", "Global Reporting Initiative — международные стандарты отчётности об устойчивом развитии."],
    ["IFRS S1, S2", "Стандарты раскрытия информации об устойчивом развитии и о климате, выпущенные ISSB (2023)."],
    ["GHG Protocol", "Международный стандарт учёта выбросов парниковых газов компаний."],
    ["МГЭИК (IPCC)", "Межправительственная группа экспертов по изменению климата; её Руководящие указания 2006 года — источник коэффициентов выбросов."],
    ["ПГ", "Парниковые газы: CO₂, CH₄, N₂O, фторсодержащие газы."],
    ["CO₂-экв.", "Эквивалент диоксида углерода — единица, приводящая разные парниковые газы к общему знаменателю."],
    ["Охват 1", "Прямые выбросы из источников, которыми владеет или управляет компания."],
    ["Охват 2", "Косвенные выбросы от производства купленной электроэнергии и тепла."],
    ["Охват 3", "Прочие косвенные выбросы в цепочке создания стоимости (поставщики, поездки, отходы и т.д.)."],
    ["Географический метод", "Расчёт Охвата 2 по среднему коэффициенту выбросов энергосистемы (location-based)."],
    ["ВИЭ", "Возобновляемые источники энергии."],
    ["LTIFR", "Lost Time Injury Frequency Rate — число несчастных случаев с потерей трудоспособности на 1 млн отработанных часов."],
    ["Двойная существенность", "Оценка темы с двух сторон: воздействие компании на мир и влияние темы на финансы компании."],
    ["ЦУР", "Цели устойчивого развития ООН."],
    ["ГПХ", "Гражданско-правовой договор (договор оказания услуг, подряда)."],
  ];
  return {
    title: "Приложение 4. Термины и сокращения", sheet: "Термины",
    blocks: [{ type: "table", columns: [{ label: "Термин", width: 24 }, { label: "Определение", width: 76 }], rows: terms.map((x) => ({ cells: x })) }],
  };
}

export { PILLAR_LABEL };
