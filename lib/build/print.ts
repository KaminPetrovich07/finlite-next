// ════════════════════════════════════════════════════════════════════════
// lib/build/print.ts — печатные формы раздела «Стройка» (модель OfficialDoc:
// одна и та же разметка уходит в PDF и Word).
//   • КС-2  — акт о приёмке выполненных работ (по реквизитам формы КС-2);
//   • КС-3  — справка о стоимости выполненных работ и затрат;
//   • акт сдачи-приёмки работ — приложение к договору подряда;
//   • договор подряда — типовой текст по данным объекта и сметы;
//   • акт списания материалов на объект;
//   • отчёт о расходе материалов в сравнении с нормами сметы (по типу М-29);
//   • отчёт по объекту — смета и факт по этапам и видам затрат.
// ════════════════════════════════════════════════════════════════════════

import { dateLong, dateShort, sum, sumInWords, type DocBlock } from "@/lib/docs/model";
import { itemKey } from "@/lib/ledger/stock";
import { albumFiller, type Filler } from "@/lib/primary/album";
import {
  analyze, bdocTotals, COST_LABEL, COST_TYPES, estimateTotals, ks3Rows, r2, rowAmount, workSum,
  type BuildDoc, type BuildObject,
} from "./model";

export interface PrintCtx {
  companyName: string;
  inn: string;
  city: string;
  director: string;
  directorTitle: string;
  chief: string;
  vatPayer: boolean;
}

const city = (c: PrintCtx) => (c.city || "Бишкек").replace(/^г\.?\s*/i, "");
/** «директора», «генерального директора» — должность в родительном падеже для преамбулы договора. */
function inPerson(c: PrintCtx): string {
  if (/индивидуальн/i.test(c.directorTitle)) return `${c.director || "____________________"}, действующего на основании свидетельства о государственной регистрации`;
  const gen = c.directorTitle.toLowerCase().replace(/ый\b/g, "ого").replace(/ий\b/g, "его").replace(/директор\b/, "директора").replace(/руководитель\b/, "руководителя").replace(/председатель\b/, "председателя");
  return `${gen} ${c.director || "____________________"}, действующего на основании Устава`;
}
const q = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const pct = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const contractor = (c: PrintCtx) => `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`;
const customer = (o: BuildObject) => `${o.customer || "________________"}${o.customerInn ? `, ИНН ${o.customerInn}` : ""}`;
const contractText = (o: BuildObject) => `№ ${o.contractNo || "____"} от ${o.contractDate ? dateShort(o.contractDate) : "«___» ________ 20__ г."}`;
const objectText = (o: BuildObject) => `${o.name}${o.address ? `, ${o.address}` : ""}`;

const totalsRows = (net: number, vat: number, cols: number, label = "Итого"): string[][] => {
  const row = (t: string, v: number) => { const r = Array(cols).fill(""); r[1] = t; r[cols - 1] = sum(v); return r; };
  return vat > 0 ? [row(`${label} без НДС`, net), row("НДС 12 %", vat), row("Всего с НДС", r2(net + vat))] : [row(label, net), row("Без НДС", 0).map((x, i) => (i === cols - 1 ? "—" : x))];
};
const inWords = (net: number, vat: number) => (vat > 0 ? `${sumInWords(net + vat)}, в том числе НДС ${sum(vat)} сом.` : `${sumInWords(net)}. Без НДС.`);

/** Шапка строительных форм альбома (№ 111, 112): стороны, стройка, объект, договор, номер, дата, период. */
function buildHead(f: Filler, c: PrintCtx, o: BuildObject, act: BuildDoc) {
  f.field(/^инвестор/, o.investor || customer(o)).field(/^заказчик/, customer(o)).field(/^подрядчик/, contractor(c))
    .field(/^стройка/, objectText(o)).field(/^объект/, o.name).field(/^договор подряда/, contractText(o))
    .field(/^номер документа/, act.number).field(/^дата составления/, dateShort(act.date))
    .field(/^отчетный период с/, act.from ? dateShort(act.from) : "").field(/^по$/, dateShort(act.to || act.date));
}
const fillsOf = (c: PrintCtx) => ({ org: c.companyName, inn: c.inn, director: c.director, directorTitle: c.directorTitle, chief: c.chief });

/** КС-2: акт приёмки выполненных работ — по бланку альбома (№ 111, неунифицированная форма). */
export function printKs2(c: PrintCtx, o: BuildObject, act: BuildDoc): DocBlock[] {
  const t = bdocTotals(act, o);
  const pos = new Map(o.works.map((w, i) => [w.id, String(i + 1)]));
  const f = albumFiller("nf-build-act");
  buildHead(f, c, o, act);
  f.field(/^сметная \(договорная\) стоимость/, `${sum(estimateTotals(o).works)}${o.vat ? " без НДС" : ""}`);
  act.rows.forEach((r, i) => f.rawRow("t", [String(i + 1), r.name, (r.workId && pos.get(r.workId)) || "", r.code ?? "", r.unit, q(r.qty), sum(r.price), sum(rowAmount(r))]));
  f.field(/^сдал$/, `${c.directorTitle} ${c.director}`.trim()).field(/^подрядчик \(субподрядчик\)$/, `${c.directorTitle} ${c.director}`.trim());
  return [
    ...f.blocks(fillsOf(c)).map((b) => (b.t === "table" && b.rows.length ? withTotals(b, t.net, t.vat) : b)),
    { t: "p", text: `Всего по акту: ${inWords(t.net, t.vat)}` },
  ];
}

/** Итоговые строки бланка («Итого», «Всего по акту») — с НДС, если он есть. */
function withTotals(b: Extract<DocBlock, { t: "table" }>, net: number, vat: number): DocBlock {
  const line = (label: string, v: number) => b.rows[0].map((_, i) => (i === 0 ? label : i === b.rows[0].length - 1 ? sum(v) : ""));
  const rows = b.rows.flatMap((r) => {
    if (r[0] === "Итого") return vat ? [line("Итого без НДС", net), line("НДС 12 %", vat)] : [line("Итого", net)];
    if (r[0] === "Всего по акту") return [line(vat ? "Всего по акту с НДС" : "Всего по акту", r2(net + vat))];
    return [r];
  });
  return { ...b, rows };
}

/** КС-3: справка о стоимости выполненных работ и затрат — по бланку альбома (№ 112). */
export function printKs3(c: PrintCtx, o: BuildObject, act: BuildDoc, docs: BuildDoc[]): DocBlock[] {
  const rows = ks3Rows(o, docs, act);
  const tot = (k: "fromStart" | "fromYear" | "period") => r2(rows.reduce((s, r) => s + r[k], 0));
  const vat = (n: number) => (o.vat ? r2(n * 0.12) : 0);
  const f = albumFiller("nf-build-cost");
  buildHead(f, c, o, act);
  // строки «Всего…» и «в том числе:» уже в бланке; этапы — следом, затем итог и НДС
  const line = (n: string, name: string, a: number, b: number, p: number) => [n, name, "", sum(a), sum(b), sum(p)];
  const blocks = f.blocks(fillsOf(c)).map((b) => {
    if (b.t !== "table" || !b.rows.some((r) => /^Всего работ и затрат/.test(r[1] ?? ""))) return b;
    return {
      ...b,
      rows: [
        line("", "Всего работ и затрат, включаемых в стоимость работ", tot("fromStart"), tot("fromYear"), tot("period")),
        ["", "в том числе:", "", "", "", ""],
        ...rows.map((r, i) => line(String(i + 1), r.name, r.fromStart, r.fromYear, r.period)),
        line("", "Итого", tot("fromStart"), tot("fromYear"), tot("period")),
        ...(o.vat ? [line("", "Сумма НДС 12 %", vat(tot("fromStart")), vat(tot("fromYear")), vat(tot("period"))), line("", "Всего с учётом НДС", r2(tot("fromStart") * 1.12), r2(tot("fromYear") * 1.12), r2(tot("period") * 1.12))] : [["", "Без НДС", "", "—", "—", "—"]]),
      ],
    } as DocBlock;
  });
  return [...blocks, { t: "p", text: `За отчётный период: ${inWords(tot("period"), vat(tot("period")))}` }];
}

/** Материалы, списанные на объект за период акта (для строки акта и отчёта). */
function materialsIn(docs: BuildDoc[], o: BuildObject, from: string | undefined, to: string) {
  return docs.filter((d) => d.type === "writeoff" && d.objectId === o.id && d.date <= to && (!from || d.date >= from));
}

/** Акт сдачи-приёмки выполненных работ — приложение к договору подряда. */
export function printAct(c: PrintCtx, o: BuildObject, act: BuildDoc, docs: BuildDoc[]): DocBlock[] {
  const t = bdocTotals(act, o);
  const mats = r2(materialsIn(docs, o, act.from, act.to || act.date).reduce((s, d) => s + d.rows.reduce((a, r) => a + rowAmount(r), 0), 0));
  const retention = r2(t.gross * (o.retentionPct / 100));
  const cl: string[] = [
    "Работы выполнены в полном объёме, в установленные договором сроки и с надлежащим качеством.",
    "Качество материалов и выполненных работ проверено Заказчиком в присутствии Подрядчика и соответствует условиям договора и требованиям Заказчика.",
    ...(mats > 0 ? [`При выполнении работ использованы материалы Подрядчика на сумму ${sum(mats)} сом (по себестоимости; расход материалов — в отчёте по объекту).`] : []),
    ...(retention > 0 ? [`Гарантийное удержание ${String(o.retentionPct).replace(".", ",")} % — ${sum(retention)} сом — выплачивается Заказчиком по окончании гарантийного срока${o.warrantyMonths ? ` (${o.warrantyMonths} мес.)` : ""}.`] : []),
    "Замечания Заказчика: ____________________________________________________________. Срок и порядок их устранения: ____________________________.",
  ];
  return [
    { t: "right", lines: ["Приложение № 1", `к договору подряда ${contractText(o)}`] },
    { t: "title", text: `АКТ № ${act.number}` },
    { t: "subtitle", text: "сдачи-приёмки выполненных работ" },
    { t: "p", text: `г. ${city(c)}${" ".repeat(10)}${dateLong(act.date)}`, align: "c" },
    { t: "p", text: `Во исполнение договора подряда ${contractText(o)} ${c.companyName} (Подрядчик) сдал, а ${o.customer || "________________"} (Заказчик) принял следующие работы на объекте «${objectText(o)}»${act.from ? ` за период с ${dateShort(act.from)} по ${dateShort(act.to || act.date)}` : ""}:`, indent: true },
    {
      t: "table", total: true, head: ["№", "Наименование выполненных работ", "Ед. изм.", "Количество", o.vat ? "Цена без НДС, сом" : "Цена, сом", o.vat ? "Сумма без НДС, сом" : "Сумма, сом"],
      widths: [0.6, 6.3, 1.2, 1.9, 1.9, 2.2], align: ["c", "l", "c", "r", "r", "r"],
      rows: [...act.rows.map((r, i) => [String(i + 1), r.name, r.unit, q(r.qty), sum(r.price), sum(rowAmount(r))]), ...totalsRows(t.net, t.vat, 6)],
    },
    { t: "p", text: `Всего выполнено работ на сумму: ${inWords(t.net, t.vat)}` },
    ...cl.map((text, i) => ({ t: "clause", n: `${i + 1}.`, text }) as DocBlock),
    { t: "sign", items: [{ role: `Сдал: Подрядчик — ${c.directorTitle.toLowerCase()}`, name: c.director }, { role: "Принял: Заказчик", name: "" }] },
    { t: "p", text: "М. П.                                                                                                   М. П.", small: true },
  ];
}

/** Акт списания материалов на объект строительства. */
export function printWriteoff(c: PrintCtx, o: BuildObject, d: BuildDoc): DocBlock[] {
  const total = r2(d.rows.reduce((s, r) => s + rowAmount(r), 0));
  const st = new Map(o.stages.map((s) => [s.id, s.name]));
  return [
    { t: "right", lines: ["Утверждаю", c.directorTitle, `____________ ${c.director || "________________"}`, dateLong(d.date)] },
    { t: "title", text: `АКТ № ${d.number}` },
    { t: "subtitle", text: "о списании материалов на объект строительства" },
    { t: "fields", items: [["Организация", contractor(c)], ["Объект", objectText(o)], ["Заказчик", customer(o)], ["Договор подряда", contractText(o)], ["Дата", dateLong(d.date)]] },
    {
      t: "table", total: true, head: ["№", "Материал", "Этап работ", "Ед. изм.", "Количество", "Цена, сом", "Сумма, сом"],
      widths: [0.6, 4.6, 3.4, 1.1, 1.4, 1.6, 1.9], align: ["c", "l", "l", "c", "r", "r", "r"],
      rows: [...d.rows.map((r, i) => [String(i + 1), r.name, (r.stageId && st.get(r.stageId)) || "", r.unit, q(r.qty), sum(r.price), sum(rowAmount(r))]), ["", "Итого", "", "", "", "", sum(total)]],
    },
    { t: "p", text: `Списано материалов на сумму: ${sumInWords(total)}. Материалы израсходованы на производство работ на объекте; стоимость — по средней себестоимости запасов.` },
    { t: "sign", items: [{ role: "Производитель работ (прораб)", name: "" }, { role: "Материально ответственное лицо", name: "" }, { role: "Бухгалтер", name: c.chief }] },
  ];
}

/** Отчёт о расходе основных материалов в сравнении с нормами сметы (по типу формы М-29). */
export function printMaterials(c: PrintCtx, o: BuildObject, docs: BuildDoc[], from: string | undefined, to: string): DocBlock[] {
  const all = analyze(o, docs, new Map(), to);
  const period = materialsIn(docs, o, from, to);
  const inPeriod = new Map<string, { qty: number; amount: number }>();
  for (const d of period) for (const r of d.rows) { const k = itemKey(r.name); const x = inPeriod.get(k) ?? { qty: 0, amount: 0 }; x.qty += r.qty; x.amount = r2(x.amount + rowAmount(r)); inPeriod.set(k, x); }
  const rows: string[][] = [];
  let n = 0, tPlan = 0, tFact = 0, tPeriod = 0;
  for (const s of o.stages) {
    const ms = all.materials.filter((m) => m.byStage.some((b) => b.stageId === s.id && (b.planQty > 0 || b.factQty > 0)));
    if (!ms.length) continue;
    rows.push(["", s.name, "", "", "", "", "", "", ""]);
    for (const m of ms) {
      const b = m.byStage.find((x) => x.stageId === s.id)!;
      const dev = r2(b.factQty - b.planQty);
      const planAmount = r2(b.planQty * (m.planPrice ?? 0));
      tPlan += planAmount; tFact += b.factAmount;
      rows.push([String(++n), m.name, m.unit, b.planQty ? q(b.planQty) : "—", q(b.factQty), dev === 0 ? "0" : `${dev > 0 ? "+" : "−"}${q(Math.abs(dev))}`, b.planQty ? pct(r2((b.factQty / b.planQty - 1) * 100)) : "нет в смете", sum(planAmount), sum(b.factAmount)]);
    }
  }
  for (const v of inPeriod.values()) tPeriod += v.amount;
  rows.push(["", "Итого", "", "", "", "", "", sum(r2(tPlan)), sum(r2(tFact))]);
  return [
    { t: "title", text: "ОТЧЁТ О РАСХОДЕ ОСНОВНЫХ МАТЕРИАЛОВ" },
    { t: "subtitle", text: "в строительстве в сопоставлении с производственными нормами (сметой)" },
    { t: "fields", items: [["Организация", contractor(c)], ["Объект", objectText(o)], ["Заказчик", customer(o)], ["Договор подряда", contractText(o)], ["Период", `${from ? `с ${dateShort(from)} ` : "с начала работ "}по ${dateShort(to)}`]] },
    {
      t: "table", small: true, total: true,
      heads: [
        [{ text: "№", rowSpan: 2 }, { text: "Материал", rowSpan: 2 }, { text: "Ед. изм.", rowSpan: 2 }, { text: "Количество", colSpan: 2 }, { text: "Отклонение от нормы", colSpan: 2 }, { text: "Сумма, сом", colSpan: 2 }],
        [{ text: "по смете (норма)" }, { text: "фактически" }, { text: "+ перерасход / − экономия" }, { text: "%" }, { text: "по смете" }, { text: "фактически" }],
      ],
      widths: [0.6, 5, 1.1, 1.5, 1.5, 1.8, 1.3, 1.8, 1.8], align: ["c", "l", "c", "r", "r", "r", "r", "r", "r"], rows,
    },
    { t: "p", text: `Списано за период: ${sum(r2(tPeriod))} сом; с начала работ — ${sum(r2(tFact))} сом. Перерасход сверх нормы требует объяснения производителя работ.`, small: true },
    { t: "sign", items: [{ role: "Производитель работ (прораб)", name: "" }, { role: "Проверил: бухгалтер", name: c.chief }] },
  ];
}

/** Отчёт по объекту: смета и факт по этапам и видам затрат, сдано по актам, маржа. */
export function printReport(c: PrintCtx, o: BuildObject, docs: BuildDoc[], to: string): DocBlock[] {
  const a = analyze(o, docs, new Map(), to);
  const stageRows = a.stages.map((s) => [s.name, sum(s.planWorks), sum(s.accepted), pct(s.progress), sum(s.planCost), sum(s.factCost), s.costVariance == null ? "—" : `${s.costVariance > 0 ? "+" : ""}${sum(s.costVariance)}`, s.accepted ? sum(s.profit) : "—"]);
  return [
    { t: "title", text: "ОТЧЁТ ПО ОБЪЕКТУ СТРОИТЕЛЬСТВА" },
    { t: "subtitle", text: `смета и факт на ${dateLong(to)}` },
    { t: "fields", items: [["Объект", objectText(o)], ["Заказчик", customer(o)], ["Договор подряда", contractText(o)], ["Подрядчик", contractor(c)]] },
    { t: "h", text: "1. Итоги", level: 2 },
    {
      t: "table", head: ["Показатель", "По смете", "Фактически"], widths: [5, 2.2, 2.2], align: ["l", "r", "r"],
      rows: [
        ["Стоимость работ (без НДС)", sum(a.plan.works), sum(a.accepted)],
        ["Сдано по актам КС-2, %", "100 %", pct(a.progress)],
        ["Затраты всего", sum(a.plan.cost), sum(a.factCost)],
        ...COST_TYPES.map((t) => [`  в т. ч. ${COST_LABEL[t].toLowerCase()}`, sum(a.plan.byType[t]), sum(a.factByType[t])]),
        ["Себестоимость сданных работ", "", sum(a.writtenOff)],
        ["Незавершённое производство", "", sum(a.wip)],
        ["Прибыль", sum(a.plan.margin), sum(a.grossProfit)],
        ["Рентабельность работ", pct(a.plan.marginPct), pct(a.marginPct)],
        ["Прогноз затрат на весь объект", sum(a.forecastBySmeta), a.forecastByPace == null ? "—" : sum(a.forecastByPace)],
        ["Гарантийное удержание заказчика", "", sum(a.retention)],
      ],
    },
    { t: "h", text: "2. По этапам", level: 2 },
    { t: "table", small: true, head: ["Этап", "Работы по смете", "Сдано", "%", "Затраты по смете", "Затраты факт", "Отклонение на сданный объём", "Прибыль этапа"], widths: [4, 1.6, 1.6, 0.9, 1.6, 1.6, 1.8, 1.6], align: ["l", "r", "r", "r", "r", "r", "r", "r"], rows: stageRows },
    { t: "h", text: "3. Материалы", level: 2 },
    {
      t: "table", small: true, head: ["Материал", "Ед.", "Норма", "Факт", "Откл., %", "Ещё нужно", "Сумма факт"], widths: [4.6, 1, 1.3, 1.3, 1.3, 1.4, 1.8], align: ["l", "c", "r", "r", "r", "r", "r"],
      rows: a.materials.map((m) => [m.name, m.unit, q(m.planQty), q(m.factQty), pct(m.qtyVariancePct), q(m.needQty), sum(m.factAmount)]),
    },
    ...(a.variances.rows.some((r) => r.factAmount) ? [
      { t: "h", text: "4. Отклонения от сметы: цена и количество", level: 2 } as DocBlock,
      ...(a.variances.summary ? [{ t: "p", text: a.variances.summary, small: true } as DocBlock] : []),
      {
        t: "table", small: true, head: ["Этап", "Затраты", "Ед.", "Норма", "Факт", "Цена смета", "Цена факт", "По цене", "По количеству", "Вне сметы"],
        widths: [2.6, 3.2, 0.9, 1.1, 1.1, 1.4, 1.4, 1.5, 1.6, 1.4], align: ["l", "l", "c", "r", "r", "r", "r", "r", "r", "r"],
        rows: a.variances.rows.filter((r) => r.factAmount).map((r) => [o.stages.find((s) => s.id === r.stageId)?.name ?? "", r.name, r.unit, r.planQty ? q(r.planQty) : "—", q(r.factQty), r.planPrice != null ? sum(r.planPrice) : "—", r.factPrice != null ? sum(r.factPrice) : "—", r.priceVar != null ? sum(r.priceVar) : "—", r.usageVar != null ? sum(r.usageVar) : r.done ? "—" : "в работе", r.outside ? sum(r.outside) : "—"]),
      } as DocBlock,
    ] : []),
    ...(a.warnings.length ? [{ t: "h", text: "5. На что обратить внимание", level: 2 } as DocBlock, { t: "list", items: a.warnings } as DocBlock] : []),
    { t: "sign", items: [{ role: c.directorTitle, name: c.director }, { role: "Главный бухгалтер", name: c.chief }] },
  ];
}

/** Договор подряда: типовой текст по карточке объекта и смете работ. */
export function printContract(c: PrintCtx, o: BuildObject): DocBlock[] {
  const e = estimateTotals(o);
  const vat = o.vat ? r2(e.works * 0.12) : 0;
  const hasMaterials = o.resources.some((r) => r.type === "material");
  const rows: string[][] = [];
  let n = 0;
  for (const s of o.stages) {
    const ws = o.works.filter((w) => w.stageId === s.id);
    if (!ws.length) continue;
    rows.push(["", s.name, "", "", "", ""]);
    for (const w of ws) rows.push([String(++n), w.name, w.unit, q(w.qty), sum(w.price), sum(workSum(w))]);
  }
  rows.push(...totalsRows(e.works, vat, 6));
  const cl = (num: string, text: string): DocBlock => ({ t: "clause", n: num, text });
  const adv = o.advancePct ?? 0;
  return [
    { t: "title", text: `ДОГОВОР ПОДРЯДА № ${o.contractNo || "___"}` },
    { t: "p", text: `г. ${city(c)}${" ".repeat(10)}${o.contractDate ? dateLong(o.contractDate) : "«___» ____________ 20__ г."}`, align: "c" },
    { t: "p", indent: true, text: `${o.customer || "________________"}, именуемое в дальнейшем «Заказчик», в лице ____________________, действующего на основании ____________, с одной стороны, и ${c.companyName}, именуемое в дальнейшем «Подрядчик», в лице ${inPerson(c)}, с другой стороны, заключили настоящий договор о нижеследующем.` },
    { t: "h", text: "1. Предмет договора" },
    cl("1.1.", `Подрядчик обязуется выполнить на объекте «${objectText(o)}» работы в объёме и по ценам, указанным в разделе 2 (смета), а Заказчик обязуется принять результат работ и оплатить его.`),
    cl("1.2.", hasMaterials ? "Работы выполняются из материалов Подрядчика, их стоимость включена в цену работ." : "Материалы для выполнения работ предоставляет Заказчик (давальческие материалы) по накладной; Подрядчик отчитывается об их расходе."),
    { t: "h", text: "2. Стоимость работ" },
    { t: "table", small: true, total: true, head: ["№", "Наименование работ", "Ед. изм.", "Объём", o.vat ? "Цена без НДС, сом" : "Цена, сом", o.vat ? "Стоимость без НДС, сом" : "Стоимость, сом"], widths: [0.6, 6.6, 1.1, 1.3, 1.8, 2.1], align: ["c", "l", "c", "r", "r", "r"], rows },
    cl("2.1.", `Общая стоимость работ по договору — ${sum(r2(e.works + vat))} сом (${sumInWords(r2(e.works + vat)).toLowerCase()})${o.vat ? `, в том числе НДС 12 % — ${sum(vat)} сом` : ", НДС не облагается"}.`),
    cl("2.2.", "Стоимость работ изменяется только дополнительным соглашением сторон. Работы, не предусмотренные сметой, выполняются после согласования их объёма и стоимости."),
    { t: "h", text: "3. Порядок оплаты" },
    ...(adv > 0 ? [cl("3.1.", `Заказчик перечисляет аванс в размере ${adv} % стоимости работ — ${sum(r2((e.works + vat) * adv / 100))} сом — в течение 5 банковских дней после подписания договора на основании счёта Подрядчика.`)] : []),
    cl(adv > 0 ? "3.2." : "3.1.", `Оплата выполненных работ производится в течение 10 банковских дней после подписания акта о приёмке выполненных работ (форма КС-2) и справки о стоимости выполненных работ (форма КС-3)${adv > 0 ? " с зачётом аванса пропорционально стоимости принятых работ" : ""}.`),
    ...(o.retentionPct > 0 ? [cl(adv > 0 ? "3.3." : "3.2.", `Из каждой оплаты Заказчик удерживает ${String(o.retentionPct).replace(".", ",")} % (гарантийное удержание) и выплачивает удержанную сумму по окончании гарантийного срока при отсутствии неустранённых недостатков.`)] : []),
    { t: "h", text: "4. Сроки выполнения работ" },
    cl("4.1.", `Начало работ — ${o.start ? dateLong(o.start) : "«___» ________ 20__ г."}, окончание — ${o.end ? dateLong(o.end) : "«___» ________ 20__ г."}`),
    cl("4.2.", `Работы выполняются этапами: ${o.stages.map((s) => s.name).join("; ")}.`),
    { t: "h", text: "5. Сдача и приёмка работ" },
    cl("5.1.", "По окончании этапа (или ежемесячно) Подрядчик передаёт Заказчику акт о приёмке выполненных работ (КС-2), справку о стоимости (КС-3) и счёт-фактуру в электронной форме (ЭСФ) в порядке и сроки, установленные налоговым законодательством Кыргызской Республики."),
    cl("5.2.", "Заказчик в течение 5 рабочих дней подписывает акт или направляет мотивированный отказ с перечнем недостатков и сроком их устранения."),
    cl("5.3.", "Качество материалов и работ проверяется Заказчиком в присутствии Подрядчика; скрытые работы принимаются до их закрытия."),
    { t: "h", text: "6. Гарантии" },
    cl("6.1.", `Подрядчик гарантирует качество работ в течение ${o.warrantyMonths || 12} месяцев со дня подписания последнего акта и за свой счёт устраняет недостатки, возникшие по его вине.`),
    { t: "h", text: "7. Ответственность сторон" },
    cl("7.1.", "За нарушение сроков выполнения работ Подрядчик уплачивает пеню 0,1 % от стоимости невыполненных в срок работ за каждый день просрочки, но не более 10 % их стоимости."),
    cl("7.2.", "За просрочку оплаты Заказчик уплачивает пеню 0,1 % от неоплаченной суммы за каждый день просрочки, но не более 10 % этой суммы."),
    { t: "h", text: "8. Прочие условия" },
    cl("8.1.", "Споры решаются переговорами, а при недостижении согласия — в суде по законодательству Кыргызской Республики."),
    cl("8.2.", "Договор вступает в силу со дня подписания и действует до полного исполнения обязательств. Составлен в двух экземплярах, имеющих равную силу, по одному для каждой стороны."),
    { t: "h", text: "9. Реквизиты и подписи сторон" },
    {
      t: "table", widths: [5, 5], align: ["l", "l"], head: ["Заказчик", "Подрядчик"],
      rows: [
        [o.customer || "", c.companyName],
        [`ИНН ${o.customerInn || "______________"}`, `ИНН ${c.inn || "______________"}`],
        ["Адрес: ______________________", "Адрес: ______________________"],
        ["Р/с __________________ БИК ________", "Р/с __________________ БИК ________"],
        ["______________ / ______________ /", `______________ / ${c.director || "______________"} /`],
      ],
    },
  ];
}

export const PRINT_FORMS = {
  ks2: "КС-2 — акт о приёмке выполненных работ",
  ks3: "КС-3 — справка о стоимости работ",
  act: "Акт сдачи-приёмки работ",
  invoice: "Счёт на оплату",
  writeoff: "Акт списания материалов",
  materials: "Отчёт о расходе материалов (по нормам сметы)",
  report: "Отчёт по объекту: смета и факт",
  contract: "Договор подряда",
} as const;
export type PrintForm = keyof typeof PRINT_FORMS;
