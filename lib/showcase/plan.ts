// ════════════════════════════════════════════════════════════════════════
// lib/showcase/plan.ts — демо-компания для показа: оптовая торговля на
// общем режиме (плательщик НДС), август–ноябрь 2026.
//
// Все названия и ИНН вымышленные (ИНН вида 000000000000xx). Сюжет нарочно
// живой, чтобы каждый раздел было что показать:
//  • ввоз обуви и рюкзаков из Китая через таможню и муки/сахара из
//    Казахстана (ЕАЭС) — себестоимость с пошлиной и НДС при ввозе;
//  • реализации в долг и за деньги, оплаты по накладным, возврат;
//  • зарплата, Соцфонд, аренда, проценты по кредиту, НДС по месяцам;
//  • к ноябрю — напряжение: часть зарплаты за сентябрь не выплачена,
//    поставщику тары должны с лета, НДС по сентябрьскому ввозу из ЕАЭС не
//    уплачен, рюкзаки распродаются ниже себестоимости, носки из Турции
//    проведены как обычная покупка, детские кроссовки проданы раньше, чем
//    оприходованы, одна продажа тары — без НДС.
// ════════════════════════════════════════════════════════════════════════

import { PIT_RATE, SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER } from "@/lib/tax-engine";
import { calcImport, type ImportDoc } from "@/lib/import-goods/calc";
import type { TradeDoc } from "@/lib/trade/doc";
import type { LedgerLine } from "@/lib/ledger/types";

export const SHOWCASE = {
  name: "ОсОО «Нур-Импэкс» (демо для показа)",
  inn: null as string | null,
  activity: "Оптовая торговля продуктами, обувью и сумками; импорт из Китая и Казахстана, Бишкек",
  regime: "general",
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Op =
  | { kind: "entry"; date: string; description: string; lines: LedgerLine[]; sourceRef?: string; source?: "opening" | "manual" | "payroll" }
  | { kind: "trade"; doc: TradeDoc; tag?: string; baseTag?: string }
  | { kind: "import"; doc: ImportDoc }
  | { kind: "pay"; tag: string; date: string; amount: number; via: "bank" | "cash" };

// контрагенты
const P = {
  shoes: { name: "Guangzhou Sunrise Footwear Co. (демо)" },
  grain: { name: "ТОО «Дала Астык» (демо)" },
  turk: { name: "Istanbul Corap Tekstil (демо)" },
  tara: { name: "ОсОО «Бишкек Тара»", inn: "00000000000011" },
  cargo: { name: "ОсОО «Карго Экспресс»", inn: "00000000000012" },
  rent: { name: "ОсОО «Склад-Сервис»", inn: "00000000000013" },
  bank: { name: "Банк (демо)" },
  toomarket: { name: "ОсОО «Тоо-Маркет»", inn: "00000000000021" },
  jashyl: { name: "ОсОО «Жашыл Базар»", inn: "00000000000022" },
  sadykov: { name: "ИП Садыков Н.", inn: "00000000000023" },
  ysyk: { name: "ОсОО «Ысык Дүкөн»" }, // ИНН нарочно не указан
  staff: { name: "Работники" },
};

const L = (account: string, debit: number, credit: number, extra: Partial<LedgerLine> = {}): LedgerLine => ({ account, debit: r2(debit), credit: r2(credit), ...extra });
const party = (p: { name: string; inn?: string }) => ({ party: p.name, ...(p.inn ? { partyInn: p.inn } : {}) });

type Row = TradeDoc["rows"][number];
const goods = (name: string, unit: string, qty: number, price: number): Row => ({ name, unit, kind: "goods", qty, price, vat: "12" });

let saleNo = 0;
const sale = (date: string, p: { name: string; inn?: string }, payment: TradeDoc["payment"], rows: Row[], tag?: string): Op =>
  ({ kind: "trade", tag, doc: { type: "sale", number: String(++saleNo), date, party: p.name, ...(p.inn ? { partyInn: p.inn } : {}), payment, vatIncluded: true, rows } });

export function showcasePlan(): Op[] {
  saleNo = 0;
  const ops: Op[] = [];

  // ── начальные остатки на 01.08.2026 ──────────────────────────────────────
  const opening: LedgerLine[] = [
    L("1110", 80_000, 0), L("1210", 1_900_000, 0),
    L("1610", 160_000, 0, { item: "Мука пшеничная в/с", qty: 5_000, unit: "кг" }),
    L("1610", 110_000, 0, { item: "Сахар-песок", qty: 2_000, unit: "кг" }),
    L("2140", 650_000, 0, { memo: "Стеллажи и погрузчик" }), L("2194", 0, 120_000),
    L("1410", 240_000, 0, { ...party(P.toomarket) }),
    L("3110", 0, 90_000, { ...party(P.tara) }),
    L("3310", 0, 1_500_000, { ...party(P.bank) }),
    L("5110", 0, 100_000),
  ];
  opening.push(L("5300", 0, opening.reduce((s, l) => s + l.debit - l.credit, 0)));
  ops.push({ kind: "entry", source: "opening", date: "2026-08-01", description: "Начальные остатки на 01.08.2026", lines: opening });

  // ── ввоз ─────────────────────────────────────────────────────────────────
  const imp1: ImportDoc = {
    number: "1", date: "2026-08-05", origin: "third", country: "Китай", supplier: P.shoes.name, currency: "USD", rate: 87.45,
    rows: [{ item: "Кроссовки мужские", hs: "6404110000", unit: "пар", qty: 600, price: 11, duty: 10 }, { item: "Рюкзаки городские", hs: "4202921100", unit: "шт", qty: 400, price: 7, duty: 5 }],
    delivery: 95_000, carrier: P.cargo.name, deliveryInCustomsValue: true, fees: 12_000, other: 0, vatPayer: true, paidNow: true, docs: "ДТ 41700/050826/0012345 (демо), CMR 778",
  };
  ops.push({ kind: "import", doc: imp1 });
  const inv1 = calcImport(imp1).totals;
  ops.push({ kind: "entry", date: "2026-08-07", description: `Оплата поставщику по контракту: ${P.shoes.name}`, lines: [L("3110", inv1.invoice, 0, { ...party(P.shoes), currency: "USD", amountCur: inv1.invoiceCur }), L("1210", 0, inv1.invoice)] });
  const imp2: ImportDoc = {
    number: "2", date: "2026-08-12", origin: "eaeu", country: "Казахстан", supplier: P.grain.name, currency: "KZT", rate: 0.17,
    rows: [{ item: "Мука пшеничная в/с", hs: "1101001100", unit: "кг", qty: 20_000, price: 175, minBase: 34 }, { item: "Сахар-песок", hs: "1701999000", unit: "кг", qty: 10_000, price: 290 }],
    delivery: 60_000, carrier: P.cargo.name, deliveryInCustomsValue: false, fees: 0, other: 0, vatPayer: true, paidNow: false, docs: "CMR 1203, заявление о ввозе № 1 (демо)",
  };
  ops.push({ kind: "import", doc: imp2 });
  ops.push({ kind: "import", doc: {
    number: "3", date: "2026-09-10", origin: "eaeu", country: "Казахстан", supplier: P.grain.name, currency: "KZT", rate: 0.169,
    rows: [{ item: "Мука пшеничная в/с", hs: "1101001100", unit: "кг", qty: 15_000, price: 178, minBase: 34 }, { item: "Сахар-песок", hs: "1701999000", unit: "кг", qty: 8_000, price: 295 }],
    delivery: 48_000, carrier: P.cargo.name, deliveryInCustomsValue: false, fees: 0, other: 0, vatPayer: true, paidNow: false, docs: "CMR 1388, заявление о ввозе № 2 (демо)",
  } });
  ops.push({ kind: "import", doc: {
    number: "4", date: "2026-10-14", origin: "eaeu", country: "Казахстан", supplier: P.grain.name, currency: "KZT", rate: 0.168,
    rows: [{ item: "Мука пшеничная в/с", hs: "1101001100", unit: "кг", qty: 15_000, price: 180, minBase: 34 }, { item: "Сахар-песок", hs: "1701999000", unit: "кг", qty: 8_000, price: 300 }],
    delivery: 48_000, carrier: P.cargo.name, deliveryInCustomsValue: false, fees: 0, other: 0, vatPayer: true, paidNow: false, docs: "CMR 1502, заявление о ввозе № 3 (демо)",
  } });
  // носки из Турции — проведены как обычная покупка, без оформления ввоза (налоговый риск для показа)
  ops.push({ kind: "entry", date: "2026-10-03", description: `Поступление носков: ${P.turk.name}`, lines: [
    L("1610", 175_000, 0, { item: "Носки хлопковые", qty: 2_000, unit: "пар" }), L("3110", 0, 175_000, { ...party(P.turk), currency: "USD", amountCur: 2_000 }),
  ] });

  // оплаты поставщику из Казахстана и перевозчику
  ops.push({ kind: "entry", date: "2026-08-28", description: `Оплата поставщику: ${P.grain.name}`, lines: [L("3110", 600_000, 0, { ...party(P.grain), currency: "KZT", amountCur: 3_529_412 }), L("1210", 0, 600_000)] });
  ops.push({ kind: "entry", date: "2026-09-25", description: `Оплата поставщику: ${P.grain.name}`, lines: [L("3110", 900_000, 0, { ...party(P.grain), currency: "KZT", amountCur: 5_325_444 }), L("1210", 0, 900_000)] });
  ops.push({ kind: "entry", date: "2026-10-27", description: `Оплата поставщику: ${P.grain.name}`, lines: [L("3110", 700_000, 0, { ...party(P.grain), currency: "KZT", amountCur: 4_166_667 }), L("1210", 0, 700_000)] });
  ops.push({ kind: "entry", date: "2026-08-30", description: `Оплата за доставку: ${P.cargo.name}`, lines: [L("3110", 60_000, 0, party(P.cargo)), L("1210", 0, 60_000)] });
  ops.push({ kind: "entry", date: "2026-09-30", description: `Оплата за доставку: ${P.cargo.name}`, lines: [L("3110", 48_000, 0, party(P.cargo)), L("1210", 0, 48_000)] });
  // НДС при ввозе из ЕАЭС: за август уплачен в срок, за сентябрь — нет
  ops.push({ kind: "entry", date: "2026-09-18", description: "Уплата НДС при ввозе из ЕАЭС за август (заявление о ввозе № 1)", lines: [L("3490", calcImport(imp2).totals.vat, 0, { party: "НДС при ввозе из ЕАЭС" }), L("1210", 0, calcImport(imp2).totals.vat)] });

  // ── продажи по месяцам ──────────────────────────────────────────────────
  const months = [
    { m: "08", flour: 8_000, sugar: 3_500, shoes: 140, bags: 90 },
    { m: "09", flour: 10_000, sugar: 4_500, shoes: 160, bags: 110 },
    { m: "10", flour: 11_000, sugar: 5_000, shoes: 150, bags: 0 },
    { m: "11", flour: 6_000, sugar: 2_600, shoes: 70, bags: 0 },
  ];
  for (const x of months) {
    const d = (day: number) => `2026-${x.m}-${String(day).padStart(2, "0")}`;
    const half = (n: number) => Math.round(n / 2);
    ops.push(sale(d(x.m === "11" ? 4 : 8), P.toomarket, "credit", [goods("Мука пшеничная в/с", "кг", half(x.flour), 48), goods("Сахар-песок", "кг", half(x.sugar), 78)], `tm-${x.m}`));
    ops.push(sale(d(x.m === "11" ? 6 : 12), P.jashyl, "bank", [goods("Мука пшеничная в/с", "кг", half(x.flour) - 1_000, 47), goods("Сахар-песок", "кг", half(x.sugar), 77)], `jb-${x.m}`));
    ops.push(sale(d(x.m === "11" ? 7 : 15), P.sadykov, "credit", [goods("Кроссовки мужские", "пар", x.shoes, 2_400), ...(x.bags ? [goods("Рюкзаки городские", "шт", x.bags, 1_500)] : [])], `sd-${x.m}`));
    ops.push(sale(d(x.m === "11" ? 9 : 20), P.ysyk, "cash", [goods("Мука пшеничная в/с", "кг", 1_000, 50)]));
  }
  // возврат от покупателя: часть сахара с повреждённой упаковкой, деньги вернули на счёт
  ops.push({ kind: "trade", baseTag: "jb-10", doc: { type: "saleReturn", number: "1", date: "2026-10-16", party: P.jashyl.name, partyInn: P.jashyl.inn, payment: "bank", vatIncluded: true,
    basis: "Акт о повреждении упаковки (демо)", rows: [goods("Сахар-песок", "кг", 200, 77)] } });
  // распродажа рюкзаков ниже себестоимости (уценка)
  ops.push(sale("2026-10-18", P.ysyk, "cash", [goods("Рюкзаки городские", "шт", 120, 600)]));
  // носки
  ops.push(sale("2026-10-22", P.jashyl, "bank", [goods("Носки хлопковые", "пар", 900, 150)]));
  // детские кроссовки продали раньше, чем оприходовали (налоговый риск)
  ops.push(sale("2026-11-10", P.sadykov, "credit", [goods("Кроссовки детские", "пар", 20, 1_800)]));
  // продажа тары без НДС (налоговый риск)
  ops.push({ kind: "entry", date: "2026-10-25", description: "Продажа возвратной тары за наличные", lines: [L("1110", 15_000, 0), L("6110", 0, 15_000, { memo: "Тара (мешки)" })] });

  // оплаты покупателей по накладным
  ops.push({ kind: "pay", tag: "tm-08", date: "2026-08-25", amount: 300_000, via: "bank" });
  ops.push({ kind: "pay", tag: "tm-08", date: "2026-09-10", amount: 105_000, via: "bank" });
  ops.push({ kind: "pay", tag: "sd-08", date: "2026-08-29", amount: 471_000, via: "bank" });
  ops.push({ kind: "pay", tag: "tm-09", date: "2026-10-05", amount: 300_000, via: "bank" });
  ops.push({ kind: "pay", tag: "sd-09", date: "2026-09-28", amount: 400_000, via: "bank" });
  ops.push({ kind: "pay", tag: "sd-09", date: "2026-10-12", amount: 149_000, via: "bank" });
  ops.push({ kind: "pay", tag: "sd-10", date: "2026-11-02", amount: 200_000, via: "bank" });
  ops.push({ kind: "pay", tag: "tm-10", date: "2026-11-12", amount: 150_000, via: "bank" });
  // часть денег Тоо-Маркета за прошлые месяцы — наличными в кассу
  ops.push({ kind: "entry", date: "2026-08-20", description: `Погашение долга прошлого периода: ${P.toomarket.name}`, lines: [L("1210", 240_000, 0), L("1410", 0, 240_000, party(P.toomarket))] });

  // ── зарплата, налоги, аренда, проценты, инкассация ──────────────────────
  const gross = 180_000;
  const empSoc = r2(gross * SOCIAL_EMPLOYEE), pit = r2((gross - empSoc) * PIT_RATE), net = r2(gross - empSoc - pit), erSoc = r2(gross * SOCIAL_EMPLOYER);
  for (const m of ["08", "09", "10"]) {
    const end = m === "08" ? "2026-08-31" : m === "09" ? "2026-09-30" : "2026-10-31";
    ops.push({ kind: "entry", source: "payroll", date: end, description: `Начисление зарплаты за ${m}.2026`, lines: [
      L("8010", gross, 0), L("3530", 0, empSoc, { memo: "взносы работника 10%" }), L("3420", 0, pit, { memo: "подоходный налог 10%" }), L("3520", 0, net, party(P.staff)),
      L("8020", erSoc, 0), L("3530", 0, erSoc, { memo: "взносы работодателя" }),
    ] });
  }
  ops.push({ kind: "entry", date: "2026-09-05", description: "Выплата зарплаты за август", lines: [L("3520", net, 0, party(P.staff)), L("1210", 0, net)] });
  ops.push({ kind: "entry", date: "2026-09-15", description: "Перечисление взносов в Соцфонд и подоходного налога за август", lines: [L("3530", empSoc + erSoc, 0), L("3420", pit, 0), L("1210", 0, empSoc + erSoc + pit)] });
  // за сентябрь выплатили только половину — задержка зарплаты к ноябрю
  ops.push({ kind: "entry", date: "2026-10-05", description: "Выплата зарплаты за сентябрь (частично)", lines: [L("3520", r2(net / 2), 0, party(P.staff)), L("1210", 0, r2(net / 2))] });
  ops.push({ kind: "entry", date: "2026-10-15", description: "Перечисление взносов в Соцфонд и подоходного налога за сентябрь", lines: [L("3530", empSoc + erSoc, 0), L("3420", pit, 0), L("1210", 0, empSoc + erSoc + pit)] });
  // за октябрь к середине ноября выплачено только 50 000 — они закрывают сентябрьский долг частично
  ops.push({ kind: "entry", date: "2026-11-12", description: "Частичная выплата зарплаты", lines: [L("3520", 50_000, 0, party(P.staff)), L("1210", 0, 50_000)] });
  for (const [d, pay] of [["2026-08-10", true], ["2026-09-10", true], ["2026-10-10", true], ["2026-11-10", false]] as const) {
    ops.push({ kind: "entry", date: d, description: `Аренда склада за ${d.slice(5, 7)}.2026`, lines: pay ? [L("8030", 60_000, 0), L("1210", 0, 60_000)] : [L("8030", 60_000, 0), L("3110", 0, 60_000, party(P.rent))] });
  }
  for (const d of ["2026-08-25", "2026-09-25", "2026-10-26"]) {
    ops.push({ kind: "entry", date: d, description: `Проценты по кредиту: ${P.bank.name}`, lines: [L("9510", 22_500, 0, party(P.bank)), L("1210", 0, 22_500)] });
  }
  for (const [d, a] of [["2026-08-21", 90_000], ["2026-09-21", 40_000], ["2026-10-21", 150_000], ["2026-11-11", 40_000]] as const) {
    ops.push({ kind: "entry", date: d, description: "Инкассация: сдача наличной выручки в банк", lines: [L("1210", a, 0), L("1110", 0, a)] });
  }
  ops.push({ kind: "entry", date: "2026-08-31", description: "Амортизация оборудования склада", lines: [L("8470", 6_500, 0), L("2194", 0, 6_500)] });
  ops.push({ kind: "entry", date: "2026-09-30", description: "Амортизация оборудования склада", lines: [L("8470", 6_500, 0), L("2194", 0, 6_500)] });
  ops.push({ kind: "entry", date: "2026-10-31", description: "Амортизация оборудования склада", lines: [L("8470", 6_500, 0), L("2194", 0, 6_500)] });
  // номера реализаций — сквозные по дате, как в настоящем журнале
  const sales = ops.filter((o): o is Extract<Op, { kind: "trade" }> => o.kind === "trade" && o.doc.type === "sale").sort((a, b) => a.doc.date.localeCompare(b.doc.date));
  sales.forEach((o, i) => { o.doc.number = String(i + 1); });
  return ops;
}

/** НДС за месяц: зачёт входного и уплата остатка — строится по журналу при посеве (суммы зависят от себестоимости и ввоза). */
/** Отчёты, уже сданные в ГНС к середине ноября (форма|начало периода → дата сдачи) — чтобы календарь не горел красным. */
export const FILED: Record<string, string> = {
  "STI-161|2026-08-01": "2026-09-18", "STI-161|2026-09-01": "2026-10-17",
  "STI-062|2026-08-01": "2026-09-19", "STI-062|2026-09-01": "2026-10-19",
  "STI-129|2026-07-01": "2026-10-19",
};

export const VAT_SETTLE = [
  { month: "2026-08", pay: "2026-09-20" },
  { month: "2026-09", pay: "2026-10-20" },
  { month: "2026-10", pay: null as string | null }, // срок 20.11 — ещё не наступил
];
