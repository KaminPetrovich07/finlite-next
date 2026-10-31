// ════════════════════════════════════════════════════════════════════════
// lib/primary/build.ts — первичные документы и регистры из журнала.
//
// Реквизиты форм — по ПП № 281 (КО-1, КО-2), альбому межведомственных форм
// первичной учётной документации и ПП № 609 (регистры малого бизнеса).
// Подписанты берутся из учётной политики (приложение 5), сроки и методы
// амортизации — из её раздела об основных средствах.
// ════════════════════════════════════════════════════════════════════════

import { accountName } from "@/lib/ledger/accounts";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";
import { qtyText, stockByItem, unitPrice } from "@/lib/ledger/stock";
import type { PolicyInput } from "@/lib/policy/types";
import { DEP_METHOD } from "@/lib/policy/types";
import { dateLong, dateShort, sum, sumInWords, type DocBlock } from "@/lib/docs/model";
import {
  corrAccount, counterpartyOf, DOC_INFO, docAmount, FA_RE, numberDocs, REGISTER_INFO, STOCK_RE,
  type DocKind, type RegisterKind,
} from "./detect";

export interface People { director: string; directorTitle: string; chief: string; cashier: string; storekeeper: string }

export interface PrimaryCtx {
  companyName: string;
  inn: string;
  people: People;
  policy: PolicyInput | null;
  /** the whole journal — balances need history */
  entries: LedgerEntry[];
}

/** Fields the user may correct before printing; empty = taken from the journal. */
export interface Overrides {
  party?: string;      // принято от / выдать / поставщик / покупатель
  basis?: string;      // основание
  attachment?: string; // приложение
  item?: string;       // наименование ценностей, объекта, работ
  qty?: string;
  unit?: string;
  idDoc?: string;      // документ, удостоверяющий личность (КО-2)
  invNo?: string;      // инвентарный номер (ОС-1, ОС-4)
  reason?: string;     // причина списания (ОС-4)
}

export function peopleFromPolicy(p: PolicyInput | null): People {
  const find = (re: RegExp) => p?.signatories.find((s) => re.test(s.role))?.name ?? "";
  return {
    director: p?.director ?? "",
    directorTitle: p?.directorTitle || "Руководитель",
    chief: p?.chiefAccountant || find(/бухгалтер/i),
    cashier: find(/касс/i),
    storekeeper: find(/склад|кладов/i),
  };
}

/** Строка товарного документа: наименование, ед., кол-во, цена — из строки журнала, правки пользователя важнее. */
function itemRow(l: LedgerLine, o: Overrides, only: boolean): { name: string; unit: string; qty: string; price: string } {
  const amount = l.debit || l.credit;
  const qtyOver = only && o.qty ? Number(String(o.qty).replace(",", ".")) : NaN;
  const q = Number.isFinite(qtyOver) && qtyOver > 0 ? qtyOver : Number(l.qty ?? 0);
  return {
    name: (only && o.item) || l.item || l.memo || accountName(l.account),
    unit: (only && o.unit) || l.unit || "",
    qty: q > 0 ? qtyText(q) : (only ? o.qty ?? "" : ""),
    price: q > 0 ? sum(amount / q) : "",
  };
}

const orgLine = (c: PrimaryCtx): DocBlock => ({ t: "p", text: `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`, bold: true });
const formHead = (lines: string[]): DocBlock => ({ t: "right", lines, small: true });

// ── отдельные документы ────────────────────────────────────────────────────

export function buildEntryDoc(kind: DocKind, e: LedgerEntry, number: number, c: PrimaryCtx, o: Overrides = {}): DocBlock[] {
  const amount = docAmount(e, kind);
  const retail = kind === "ko1" && /^61\d\d$/.test(corrAccount(e, "ko1"));
  const party = o.party || counterpartyOf(e) || (retail ? "Розничные покупатели (наличная выручка)" : "");
  const basis = o.basis || e.description;
  const no = String(number);
  const ppl = c.people;

  switch (kind) {
    case "ko1": {
      const corr = corrAccount(e, kind);
      return [
        formHead(["Приложение 1 к Порядку ведения кассовых операций (ПП № 281)", "Унифицированная форма КО-1", "Форма по ОКУД 0310001"]),
        orgLine(c),
        { t: "table", head: ["Номер документа", "Дата составления"], rows: [[no, dateShort(e.date)]], widths: [1, 1], align: ["c", "c"] },
        { t: "title", text: "Приходный кассовый ордер" },
        { t: "table", head: ["Дебет", "Кредит: корреспондирующий счёт", "Код аналитического учёта", "Сумма, сом", "Код целевого назначения"], rows: [["1110", corr, "", sum(amount), ""]], widths: [1, 2, 2, 2, 2], align: ["c", "c", "c", "r", "c"] },
        { t: "fields", items: [["Принято от", party], ["Основание", basis], ["Сумма", sumInWords(amount)], ["В том числе", ""], ["Приложение", o.attachment ?? ""]] },
        { t: "sign", items: [{ role: "Главный бухгалтер", name: ppl.chief }, { role: "Получил кассир", name: ppl.cashier }] },
        { t: "cut" },
        orgLine(c),
        { t: "subtitle", text: `Квитанция к приходному кассовому ордеру № ${no} от ${dateShort(e.date)}` },
        { t: "fields", items: [["Принято от", party], ["Основание", basis], ["Сумма", `${sum(amount)} (${sumInWords(amount)})`]] },
        { t: "p", text: "М. П.", small: true },
        { t: "sign", items: [{ role: "Главный бухгалтер", name: ppl.chief }, { role: "Кассир", name: ppl.cashier }] },
      ];
    }
    case "ko2": {
      const corr = corrAccount(e, kind);
      return [
        formHead(["Приложение 2 к Порядку ведения кассовых операций (ПП № 281)", "Унифицированная форма КО-2", "Форма по ОКУД 0310002"]),
        orgLine(c),
        { t: "table", head: ["Номер документа", "Дата составления"], rows: [[no, dateShort(e.date)]], widths: [1, 1], align: ["c", "c"] },
        { t: "title", text: "Расходный кассовый ордер" },
        { t: "table", head: ["Дебет: корреспондирующий счёт", "Код аналитического учёта", "Кредит", "Сумма, сом", "Код целевого назначения"], rows: [[corr, "", "1110", sum(amount), ""]], widths: [2, 2, 1, 2, 2], align: ["c", "c", "c", "r", "c"] },
        { t: "fields", items: [["Выдать", party], ["Основание", basis], ["Сумма", sumInWords(amount)], ["Приложение", o.attachment ?? ""]] },
        { t: "sign", items: [{ role: ppl.directorTitle, name: ppl.director }, { role: "Главный бухгалтер", name: ppl.chief }] },
        { t: "fields", items: [["Получил (сумма прописью)", ""], ["Дата", "«___» ____________ 20__ г."], ["По документу, удостоверяющему личность", o.idDoc ?? ""]] },
        { t: "sign", items: [{ role: "Получатель", name: "" }, { role: "Выдал кассир", name: ppl.cashier }] },
        { t: "note", text: "Получатель собственноручно указывает полученную сумму: сомы — прописью, тыйыны — цифрами (ПП № 281, п. 12)." },
      ];
    }
    case "ao1": {
      const spent = e.lines.filter((l) => l.debit > 0);
      return [
        formHead(["Унифицированная форма АО-1"]),
        orgLine(c),
        { t: "title", text: `Авансовый отчёт № ${no}` },
        { t: "p", text: `от ${dateLong(e.date)}`, align: "c" },
        { t: "fields", items: [["Подотчётное лицо", party], ["Назначение аванса", basis]] },
        { t: "table", head: ["Показатель", "Сумма, сом"], widths: [3, 1], align: ["l", "r"], rows: [["Остаток (перерасход) предыдущего аванса", ""], ["Получен аванс", ""], ["Израсходовано", sum(amount)], ["Остаток / перерасход", ""]] },
        { t: "h", text: "Бухгалтерская запись", level: 2 },
        { t: "table", head: ["Дебет", "Наименование счёта", "Кредит", "Сумма, сом"], widths: [1, 4, 1, 2], align: ["c", "l", "c", "r"], total: true,
          rows: [...spent.map((l) => [l.account, accountName(l.account), "1520", sum(l.debit)]), ["", "Итого", "", sum(amount)]] },
        { t: "fields", items: [["Приложение: документов", o.attachment ?? ""]] },
        { t: "sign", items: [{ role: "Подотчётное лицо", name: party }, { role: "Отчёт проверил бухгалтер", name: ppl.chief }, { role: "Утверждаю", name: ppl.director }] },
      ];
    }
    case "m4": {
      const lines = e.lines.filter((l) => l.debit > 0 && STOCK_RE.test(l.account));
      const corr = e.lines.find((l) => l.credit > 0)?.account ?? "";
      return [
        formHead(["Унифицированная форма М-4"]),
        orgLine(c),
        { t: "title", text: `Приходный ордер № ${no}` },
        { t: "table", head: ["Дата составления", "Склад", "Поставщик", "Корр. счёт", "Сопроводительный документ"], rows: [[dateShort(e.date), "", party, corr, o.attachment ?? ""]], widths: [2, 2, 4, 1.5, 3], align: ["c", "c", "l", "c", "l"] },
        { t: "table", head: ["Счёт", "Наименование ценностей", "Ед. изм.", "Кол-во по документу", "Принято", "Цена", "Сумма, сом"], widths: [1, 5, 1, 1.5, 1.5, 1.5, 2], align: ["c", "l", "c", "r", "r", "r", "r"], total: lines.length > 1,
          rows: [...lines.map((l) => { const r = itemRow(l, o, lines.length === 1); return [l.account, r.name, r.unit, r.qty, r.qty, r.price, sum(l.debit)]; }), ...(lines.length > 1 ? [["", "Итого", "", "", "", "", sum(amount)]] : [])] },
        { t: "sign", items: [{ role: "Принял (заведующий складом)", name: ppl.storekeeper }, { role: "Сдал (экспедитор)", name: "" }] },
      ];
    }
    case "m11":
    case "m15": {
      const lines = e.lines.filter((l) => l.credit > 0 && STOCK_RE.test(l.account));
      const to = e.lines.find((l) => l.debit > 0)?.account ?? "";
      const title = kind === "m11" ? `Требование-накладная № ${no}` : `Накладная на отпуск материалов на сторону № ${no}`;
      return [
        formHead([`Унифицированная форма ${DOC_INFO[kind].code}`]),
        orgLine(c),
        { t: "title", text: title },
        { t: "table", head: ["Дата составления", "Отправитель", "Получатель", "Корр. счёт"], rows: [[dateShort(e.date), "Склад", kind === "m11" ? "Производство (цех)" : party, to]], widths: [2, 3, 4, 1.5], align: ["c", "l", "l", "c"] },
        { t: "table", head: ["Счёт", "Наименование ценностей", "Ед. изм.", "Затребовано", "Отпущено", "Цена", "Сумма, сом"], widths: [1, 5, 1, 1.5, 1.5, 1.5, 2], align: ["c", "l", "c", "r", "r", "r", "r"],
          rows: lines.map((l) => { const r = itemRow(l, o, lines.length === 1); return [l.account, r.name, r.unit, r.qty, r.qty, r.price, sum(l.credit)]; }) },
        { t: "fields", items: [["Основание", basis]] },
        { t: "sign", items: [{ role: "Затребовал", name: "" }, { role: "Разрешил", name: ppl.director }, { role: "Отпустил", name: ppl.storekeeper }, { role: "Получил", name: "" }] },
      ];
    }
    case "os1": {
      const line = e.lines.find((l) => l.debit > 0 && FA_RE.test(l.account))!;
      const life = usefulLife(line.account, c.policy);
      return [
        formHead(["Унифицированная форма ОС-1"]),
        orgLine(c),
        { t: "title", text: `Акт (накладная) приёмки-передачи основных средств № ${no}` },
        { t: "p", text: `от ${dateLong(e.date)}`, align: "c" },
        { t: "table", head: ["Дата принятия к учёту", "Счёт", "Инвентарный номер", "Сдатчик (поставщик)"], rows: [[dateShort(e.date), line.account, o.invNo ?? "", party]], widths: [2, 1, 2, 4], align: ["c", "c", "c", "l"] },
        { t: "table", head: ["Наименование объекта", "Группа", "Первоначальная стоимость, сом", "Срок полезного использования, лет", "Метод амортизации"],
          rows: [[o.item || basis, accountName(line.account), sum(line.debit), life ? String(life) : "", c.policy ? DEP_METHOD[c.policy.depMethod] : ""]], widths: [4, 3, 2, 2, 3], align: ["l", "l", "r", "c", "l"] },
        { t: "p", text: "Объект технически исправен, комплектен и соответствует условиям договора. Объект принят в эксплуатацию.", small: true },
        { t: "p", text: "Приёмочная комиссия:", bold: true },
        { t: "sign", items: [{ role: "Председатель комиссии", name: ppl.director }, { role: "Член комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Объект сдал", name: "" }, { role: "Объект принял", name: "" }, { role: "Главный бухгалтер", name: ppl.chief }] },
      ];
    }
    case "os4": {
      const line = e.lines.find((l) => l.credit > 0 && FA_RE.test(l.account))!;
      const dep = e.lines.filter((l) => l.debit > 0 && /^219\d$/.test(l.account)).reduce((s, l) => s + l.debit, 0);
      return [
        formHead(["Унифицированная форма ОС-4"]),
        orgLine(c),
        { t: "right", lines: ["УТВЕРЖДАЮ", `${ppl.directorTitle} ____________ ${ppl.director}`, "«___» ____________ 20__ г."] },
        { t: "title", text: `Акт на списание основных средств № ${no}` },
        { t: "p", text: `от ${dateLong(e.date)}`, align: "c" },
        { t: "table", head: ["Наименование объекта", "Инвентарный номер", "Первоначальная стоимость", "Накопленная амортизация", "Остаточная стоимость"],
          rows: [[o.item || basis, o.invNo ?? "", sum(line.credit), dep ? sum(dep) : "", dep ? sum(line.credit - dep) : ""]], widths: [4, 2, 2, 2, 2], align: ["l", "c", "r", "r", "r"] },
        { t: "fields", items: [["Причина списания", o.reason ?? ""], ["Заключение комиссии", ""]] },
        { t: "sign", items: [{ role: "Председатель комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Главный бухгалтер", name: ppl.chief }] },
      ];
    }
    case "t49": {
      const wages = e.lines.filter((l) => l.debit > 0);
      return [
        formHead(["Унифицированная форма Т-49"]),
        orgLine(c),
        { t: "title", text: `Расчётно-платёжная ведомость № ${no}` },
        { t: "p", text: `за ${monthYear(e.date)} · ${basis}`, align: "c" },
        { t: "table", head: ["Подразделение / работник", "Табельный №", "Начислено, сом", "Удержано, сом", "К выдаче, сом", "Подпись в получении"], widths: [5, 1.5, 2, 2, 2, 2.5], align: ["l", "c", "r", "r", "r", "l"], total: true,
          rows: [...wages.map((l) => [l.memo || accountName(l.account), "", sum(l.debit), "", "", ""]), ...Array.from({ length: 6 }, () => ["", "", "", "", "", ""]), ["Итого", "", sum(amount), "", "", ""]] },
        { t: "note", text: "Строки по работникам заполняются по табелю (Т-13) и лицевым счетам; удержания — страховые взносы работника и подоходный налог по НК КР." },
        { t: "fields", items: [["К выплате за период с", "«___» ____ 20__ г. по «___» ____ 20__ г."]] },
        { t: "sign", items: [{ role: ppl.directorTitle, name: ppl.director }, { role: "Главный бухгалтер", name: ppl.chief }] },
      ];
    }
    case "t53": {
      return [
        formHead(["Унифицированная форма Т-53"]),
        orgLine(c),
        { t: "title", text: `Платёжная ведомость № ${no}` },
        { t: "fields", items: [["В кассу для оплаты в срок", "с «___» ____ по «___» ____ 20__ г."], ["Сумма", sumInWords(amount)], ["Основание", basis]] },
        { t: "table", head: ["№", "Табельный №", "Ф.И.О.", "Сумма, сом", "Подпись в получении"], widths: [0.7, 1.5, 5, 2, 3], align: ["c", "c", "l", "r", "l"], total: true,
          rows: [...Array.from({ length: 8 }, (_, i) => [String(i + 1), "", "", "", ""]), ["", "", "Итого", sum(amount), ""]] },
        { t: "note", text: `На общую сумму выданной заработной платы составляется один расходный кассовый ордер; его дата и номер проставляются на ведомости (ПП № 281, п. 14). Документ к записи от ${dateShort(e.date)}.` },
        { t: "sign", items: [{ role: ppl.directorTitle, name: ppl.director }, { role: "Главный бухгалтер", name: ppl.chief }, { role: "Выплату произвёл кассир", name: ppl.cashier }] },
      ];
    }
    case "waybill":
    case "act":
    case "invoice": {
      const title = kind === "waybill" ? `Накладная на отпуск товаров (продукции) № ${no}` : kind === "act" ? `Акт выполненных работ (оказанных услуг) № ${no}` : `Счёт на оплату № ${no}`;
      const sold = e.lines.filter((l) => l.credit > 0 && /^61\d\d$/.test(l.account) && (l.item || l.qty));
      const goods = sold.length
        ? sold.map((l, i) => { const r = itemRow(l, o, sold.length === 1); return [String(i + 1), r.name, r.unit, r.qty, r.price, sum(l.credit)]; })
        : [["1", o.item || basis, o.unit ?? "", o.qty ?? "", "", sum(amount)]];
      return [
        orgLine(c),
        { t: "title", text: title },
        { t: "p", text: `от ${dateLong(e.date)}`, align: "c" },
        { t: "fields", items: [[kind === "act" ? "Исполнитель" : "Поставщик", `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`], [kind === "act" ? "Заказчик" : "Покупатель", party], ["Основание", o.attachment || "договор №____ от «___» ____ 20__ г."]] },
        { t: "table", head: ["№", "Наименование", "Ед. изм.", "Количество", "Цена", "Сумма, сом"], widths: [0.6, 6, 1.2, 1.5, 1.8, 2.2], align: ["c", "l", "c", "r", "r", "r"], total: true,
          rows: [...goods, ["", "Итого", "", "", "", sum(amount)]] },
        { t: "p", text: `Всего на сумму: ${sumInWords(amount)}.${c.policy?.vatPayer ? " В том числе НДС — по счёту-фактуре (ЭСФ)." : " Без НДС."}` },
        ...(kind === "invoice"
          ? [{ t: "p", text: "Оплата по счёту в течение 5 банковских дней. Реквизиты для оплаты: ____________________________.", small: true } as DocBlock,
             { t: "sign", items: [{ role: ppl.directorTitle, name: ppl.director }, { role: "Главный бухгалтер", name: ppl.chief }] } as DocBlock]
          : kind === "act"
            ? [{ t: "p", text: "Работы (услуги) выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам не имеет.", small: true } as DocBlock,
               { t: "sign", items: [{ role: "Исполнитель", name: ppl.director }, { role: "Заказчик", name: "" }] } as DocBlock]
            : [{ t: "sign", items: [{ role: "Отпуск разрешил", name: ppl.director }, { role: "Отпустил", name: ppl.storekeeper }, { role: "Получил", name: "" }] } as DocBlock]),
      ];
    }
  }
}

function usefulLife(account: string, p: PolicyInput | null): number | null {
  if (!p) return null;
  if (account === "2110") return null;
  if (account === "2130" || account === "2120") return p.lifeBuildings;
  if (account === "2150") return p.lifeComputers;
  if (account === "2160") return p.lifeFurniture;
  if (account === "2170") return p.lifeVehicles;
  return p.lifeEquipment;
}

const MONTHS_GEN = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthYear = (iso: string) => `${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)} г.`;

// ── регистры и описи за период ────────────────────────────────────────────

export interface Period { from: string; to: string }

function balanceOn(entries: LedgerEntry[], test: (a: string) => boolean, date: string, inclusive: boolean): number {
  let s = 0;
  for (const e of entries) {
    if (inclusive ? e.date > date : e.date >= date) continue;
    for (const l of e.lines) if (test(l.account)) s += l.debit - l.credit;
  }
  return s;
}

export function buildRegister(kind: RegisterKind, c: PrimaryCtx, p: Period, services = false): DocBlock[] {
  const inPeriod = c.entries.filter((e) => e.source !== "opening" && e.date >= p.from && e.date <= p.to);
  const nums = numberDocs(c.entries, services);
  const ppl = c.people;
  const head = (title: string, code: string): DocBlock[] => [
    ...(code.startsWith("ПП") ? [formHead([`Регистр по ${code}`])] : [formHead([`Унифицированная форма ${code}`])]),
    orgLine(c),
    { t: "title", text: title },
    { t: "p", text: `за период с ${dateShort(p.from)} по ${dateShort(p.to)}`, align: "c" },
  ];
  const cashTest = (a: string) => a === "1110";

  switch (kind) {
    case "ko3": {
      const rows = inPeriod.flatMap((e) => (nums.get(e.id) ?? []).filter((d) => d.kind === "ko1" || d.kind === "ko2").map((d) => [
        dateShort(e.date), d.kind === "ko1" ? `ПКО № ${d.number}` : "", d.kind === "ko2" ? `РКО № ${d.number}` : "",
        d.kind === "ko1" ? sum(docAmount(e, "ko1")) : "", d.kind === "ko2" ? sum(docAmount(e, "ko2")) : "", e.description,
      ]));
      return [...head(REGISTER_INFO.ko3.title, "КО-3"),
        { t: "table", head: ["Дата", "Приходный", "Расходный", "Приход, сом", "Расход, сом", "Содержание операции"], widths: [1.5, 1.6, 1.6, 2, 2, 6], align: ["c", "c", "c", "r", "r", "l"], small: true, rows: rows.length ? rows : [["", "", "", "", "", "Кассовых операций за период нет"]] },
        { t: "sign", items: [{ role: "Главный бухгалтер", name: ppl.chief }] }];
    }
    case "ko4": {
      const out: DocBlock[] = [...head(REGISTER_INFO.ko4.title, "КО-4")];
      const days = Array.from(new Set(inPeriod.filter((e) => e.lines.some((l) => cashTest(l.account))).map((e) => e.date))).sort();
      if (!days.length) return [...out, { t: "p", text: "Кассовых операций за период не было — листы кассовой книги не заполняются (ПП № 281, п. 17)." }];
      let page = 0;
      for (const d of days) {
        page += 1;
        const opening = balanceOn(c.entries, cashTest, d, false);
        const rows: string[][] = [];
        let inc = 0, outc = 0;
        for (const e of inPeriod.filter((x) => x.date === d)) {
          for (const doc of nums.get(e.id) ?? []) {
            if (doc.kind !== "ko1" && doc.kind !== "ko2") continue;
            const a = docAmount(e, doc.kind);
            if (doc.kind === "ko1") inc += a; else outc += a;
            rows.push([doc.kind === "ko1" ? `ПКО ${doc.number}` : `РКО ${doc.number}`, `${counterpartyOf(e) || ""} ${e.description}`.trim(), corrAccount(e, doc.kind), doc.kind === "ko1" ? sum(a) : "", doc.kind === "ko2" ? sum(a) : ""]);
          }
        }
        out.push(
          { t: "h", text: `Касса за ${dateLong(d)} · лист ${page}`, level: 2 },
          { t: "table", head: ["Номер документа", "От кого получено или кому выдано", "Корр. счёт", "Приход, сом", "Расход, сом"], widths: [1.6, 6, 1.2, 2, 2], align: ["c", "l", "c", "r", "r"], small: true,
            rows: [["", "Остаток на начало дня", "", sum(opening), ""], ...rows, ["", "Итого за день", "", sum(inc), sum(outc)], ["", "Остаток на конец дня", "", sum(opening + inc - outc), ""]] },
          { t: "sign", items: [{ role: "Кассир", name: ppl.cashier }] },
        );
      }
      return out;
    }
    case "inv15": {
      const book = balanceOn(c.entries, cashTest, p.to, true);
      return [
        formHead(["Унифицированная форма ИНВ-15", "Приложение 5 к Порядку ведения кассовых операций (ПП № 281)"]),
        orgLine(c),
        { t: "title", text: "Акт инвентаризации наличных денежных средств" },
        { t: "p", text: `по состоянию на ${dateLong(p.to)}`, align: "c" },
        { t: "p", text: "Расписка: к началу проведения инвентаризации все расходные и приходные документы на денежные средства сданы в бухгалтерию и все денежные средства, поступившие на мою ответственность, оприходованы, а выбывшие списаны в расход.", small: true },
        { t: "sign", items: [{ role: "Кассир (материально ответственное лицо)", name: ppl.cashier }] },
        { t: "table", head: ["Показатель", "Сумма, сом"], widths: [4, 2], align: ["l", "r"], rows: [
          ["Наличных денежных средств (фактически)", ""],
          ["По учётным данным (счёт 1110)", sum(book)],
          ["Результаты инвентаризации: излишек", ""],
          ["Результаты инвентаризации: недостача", ""],
        ] },
        { t: "fields", items: [["Последние номера кассовых ордеров", lastNumbers(nums, c.entries, p.to)], ["Объяснение причин излишков или недостач", ""]] },
        { t: "p", text: "Комиссия:", bold: true },
        { t: "sign", items: [{ role: "Председатель комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Член комиссии", name: "" }] },
      ];
    }
    case "inv3":
    case "inv1": {
      const test = kind === "inv3" ? (a: string) => STOCK_RE.test(a) || a === "1630" || a === "1640" || a === "1650" : (a: string) => FA_RE.test(a);
      const codes = Array.from(new Set(c.entries.flatMap((e) => e.lines.map((l) => l.account)).filter(test))).sort();
      // ИНВ-3: по номенклатуре с количеством, если оно ведётся в журнале
      const rows = kind === "inv3"
        ? stockByItem(c.entries, p.to, test).map((b, i) => [String(i + 1), b.item || accountName(b.account), b.account, b.unit, qtyText(b.qty), sum(b.amount), "", ""])
        : codes.map((code, i) => {
          const b = balanceOn(c.entries, (a) => a === code, p.to, true);
          return [String(i + 1), accountName(code), code, "", "", sum(b), "", ""];
        }).filter((r) => r[5] !== "0,00");
      const title = kind === "inv3" ? REGISTER_INFO.inv3.title : REGISTER_INFO.inv1.title;
      return [
        formHead([`Унифицированная форма ${kind === "inv3" ? "ИНВ-3" : "ИНВ-1"}`]),
        orgLine(c),
        { t: "title", text: title },
        { t: "p", text: `по состоянию на ${dateLong(p.to)}`, align: "c" },
        { t: "table", head: ["№", "Наименование", "Счёт", "Ед. изм.", "По учёту: кол-во", "По учёту: сумма, сом", "Фактически: кол-во", "Отклонение"], widths: [0.6, 5, 1, 1, 1.6, 2, 1.8, 1.6], align: ["c", "l", "c", "c", "r", "r", "r", "r"], small: true,
          rows: rows.length ? rows : [["", "Остатков по учёту нет", "", "", "", "", "", ""]] },
        { t: "note", text: "Комиссия пересчитывает ценности по местам хранения и вписывает фактическое наличие; учётные остатки — из журнала проводок (ПП № 609, пп. 33–34)." },
        { t: "sign", items: [{ role: "Председатель комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Материально ответственное лицо", name: kind === "inv3" ? ppl.storekeeper : "" }] },
      ];
    }
    case "sales": {
      const rows = inPeriod.filter((e) => e.lines.some((l) => l.credit > 0 && /^61\d\d$/.test(l.account))).map((e, i) => {
        const amt = e.lines.filter((l) => /^61\d\d$/.test(l.account)).reduce((s, l) => s + l.credit - l.debit, 0);
        const how = e.lines.find((l) => l.debit > 0)?.account;
        return [String(i + 1), dateShort(e.date), counterpartyOf(e) || "розничные покупатели", e.description, how === "1110" ? "наличные" : how === "1410" ? "в долг" : "безналично", sum(amt)];
      });
      const total = rows.reduce((s, r) => s + parse(r[5]), 0);
      return [...head(REGISTER_INFO.sales.title, "ПП № 609"),
        { t: "table", head: ["№", "Дата", "Покупатель", "Содержание", "Оплата", "Сумма, сом"], widths: [0.6, 2, 3.5, 5.6, 1.6, 2.2], align: ["c", "c", "l", "l", "c", "r"], small: true, total: true, rows: [...rows, ["", "", "", "Итого", "", sum(total)]] },
        { t: "sign", items: [{ role: "Бухгалтер", name: ppl.chief }] }];
    }
    case "purchases": {
      const rows = inPeriod.filter((e) => e.lines.some((l) => l.debit > 0 && (STOCK_RE.test(l.account) || FA_RE.test(l.account))) && e.lines.some((l) => l.credit > 0 && ["3110", "1210", "1110", "3510"].includes(l.account))).map((e, i) => {
        const amt = e.lines.filter((l) => l.debit > 0 && (STOCK_RE.test(l.account) || FA_RE.test(l.account))).reduce((s, l) => s + l.debit, 0);
        return [String(i + 1), dateShort(e.date), counterpartyOf(e) || "", e.description, e.lines.find((l) => l.credit > 0)?.account === "3110" ? "в долг" : "оплачено", sum(amt)];
      });
      const total = rows.reduce((s, r) => s + parse(r[5]), 0);
      return [...head(REGISTER_INFO.purchases.title, "ПП № 609"),
        { t: "table", head: ["№", "Дата", "Поставщик", "Содержание", "Оплата", "Сумма, сом"], widths: [0.6, 2, 3.5, 5.6, 1.6, 2.2], align: ["c", "c", "l", "l", "c", "r"], small: true, total: true, rows: [...rows, ["", "", "", "Итого", "", sum(total)]] },
        { t: "sign", items: [{ role: "Бухгалтер", name: ppl.chief }] }];
    }
    case "payrollBook": {
      const byMonth = new Map<string, { gross: number; withheld: number; paid: number }>();
      for (const e of inPeriod) {
        const m = e.date.slice(0, 7);
        const r = byMonth.get(m) ?? { gross: 0, withheld: 0, paid: 0 };
        for (const l of e.lines) {
          if (l.account === "3520" && l.credit > 0 && e.source === "payroll") r.gross += l.credit;
          if (l.account === "3520" && l.debit > 0 && e.lines.some((x) => x.credit > 0 && (x.account === "3530" || x.account === "3420"))) r.withheld += l.debit;
          if (l.account === "3520" && l.debit > 0 && e.lines.some((x) => x.credit > 0 && (x.account === "1110" || x.account === "1210"))) r.paid += l.debit;
        }
        if (r.gross || r.withheld || r.paid) byMonth.set(m, r);
      }
      const rows = Array.from(byMonth.entries()).sort().map(([m, r]) => [monthYear(`${m}-01`), sum(r.gross), sum(r.withheld), sum(r.gross - r.withheld), sum(r.paid)]);
      return [...head(REGISTER_INFO.payrollBook.title, "ПП № 609"),
        { t: "table", head: ["Месяц", "Начислено", "Удержано (взносы, подоходный налог)", "Причитается к выплате", "Выплачено"], widths: [2, 2, 3, 2.5, 2], align: ["l", "r", "r", "r", "r"], rows: rows.length ? rows : [["Начислений нет", "", "", "", ""]] },
        { t: "note", text: "«Выплачено» в месяце может относиться к зарплате предыдущего месяца." },
        { t: "sign", items: [{ role: "Бухгалтер", name: ppl.chief }] }];
    }
    case "faBook": {
      const codes = Array.from(new Set(c.entries.flatMap((e) => e.lines.map((l) => l.account)).filter((a) => FA_RE.test(a) || /^29[0-8]\d$/.test(a)))).sort();
      const rows = codes.map((code) => {
        const open = balanceOn(c.entries, (a) => a === code, p.from, false);
        let inc = 0, dec = 0;
        for (const e of inPeriod) for (const l of e.lines) if (l.account === code) { inc += l.debit; dec += l.credit; }
        const depCode = code.startsWith("29") ? `299${code[2]}` : `219${code[2]}`;
        const depClose = -balanceOn(c.entries, (a) => a === depCode, p.to, true);
        return [code, accountName(code), sum(open), sum(inc), sum(dec), sum(open + inc - dec), depClose > 0 ? sum(depClose) : ""];
      });
      return [...head(REGISTER_INFO.faBook.title, "ПП № 609"),
        { t: "table", head: ["Счёт", "Группа", "На начало", "Поступило", "Выбыло", "На конец", "Накопленная амортизация на конец"], widths: [1, 4, 2, 2, 2, 2, 2.5], align: ["c", "l", "r", "r", "r", "r", "r"], small: true, rows: rows.length ? rows : [["", "Основных средств нет", "", "", "", "", ""]] },
        { t: "sign", items: [{ role: "Бухгалтер", name: ppl.chief }] }];
    }
    case "m2":
      return [
        formHead(["Унифицированная форма М-2"]),
        orgLine(c),
        { t: "title", text: "Доверенность № ____" },
        { t: "fields", items: [["Дата выдачи", ""], ["Доверенность действительна по", ""], ["Выдана (должность, Ф.И.О.)", ""], ["Паспорт: серия, номер, кем и когда выдан", ""], ["На получение от", ""], ["Материальных ценностей по документу", ""]] },
        { t: "table", head: ["№", "Наименование материальных ценностей", "Ед. изм.", "Количество (прописью)"], widths: [0.6, 6, 1.4, 4], rows: Array.from({ length: 5 }, (_, i) => [String(i + 1), "", "", ""]) },
        { t: "sign", items: [{ role: "Подпись лица, получившего доверенность", name: "" }, { role: ppl.directorTitle, name: ppl.director }, { role: "Главный бухгалтер", name: ppl.chief }] },
        { t: "p", text: "М. П.", small: true },
      ];
  }
}

function lastNumbers(nums: Map<string, { kind: DocKind; number: number }[]>, entries: LedgerEntry[], to: string): string {
  let ko1 = 0, ko2 = 0;
  for (const e of entries) {
    if (e.date > to) continue;
    for (const d of nums.get(e.id) ?? []) {
      if (d.kind === "ko1" && e.date.slice(0, 4) === to.slice(0, 4)) ko1 = Math.max(ko1, d.number);
      if (d.kind === "ko2" && e.date.slice(0, 4) === to.slice(0, 4)) ko2 = Math.max(ko2, d.number);
    }
  }
  return `приходный № ${ko1 || "—"}, расходный № ${ko2 || "—"}`;
}

const parse = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;

/** List of the period's entries with the documents they need. */
export function primaryList(c: PrimaryCtx, p: Period, services = false) {
  const nums = numberDocs(c.entries, services);
  return c.entries
    .filter((e) => e.source !== "opening" && e.date >= p.from && e.date <= p.to)
    .map((e) => ({
      entryId: e.id,
      date: e.date,
      description: e.description,
      counterparty: counterpartyOf(e),
      docs: (nums.get(e.id) ?? []).map((d) => ({ ...d, code: DOC_INFO[d.kind].code, title: DOC_INFO[d.kind].title, amount: docAmount(e, d.kind) })),
    }))
    .filter((r) => r.docs.length > 0);
}

