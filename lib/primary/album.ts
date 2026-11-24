// ════════════════════════════════════════════════════════════════════════
// lib/primary/album.ts — первичные документы из журнала по бланкам альбома.
//
// Бланки альбома унифицированных форм КР описаны в lib/forms/defs точно как в
// альбоме: шапка, многоуровневые графы с номерами, оборотная сторона, подписи.
// Здесь проводка журнала раскладывается по полям и графам такого бланка, и
// документ печатается тем же движком, что и чистый бланк. Поэтому КО-1, КО-2,
// АО-1, М-4, М-11, М-15, ОС-1, ОС-4, Т-49 и Т-53 из журнала совпадают с
// альбомом по составу граф и реквизитов.
//
// Поля и графы ищутся по подписи (регулярным выражением), а не по номеру —
// так раскладка не ломается, если описание бланка уточнят.
// ════════════════════════════════════════════════════════════════════════

import { FORM_BY_ID } from "@/lib/forms";
import { buildForm, fieldKey } from "@/lib/forms/render";
import type { FillValues, FormDef, FormValues } from "@/lib/forms/types";
import { dateShort, sum, sumInWords, type DocBlock } from "@/lib/docs/model";
import { accountName } from "@/lib/ledger/accounts";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";
import { findUnit, okeiCode, unitSymbol } from "@/lib/okei";
import { DEP_METHOD } from "@/lib/policy/types";
import { corrAccount, counterpartyOf, docAmount, FA_RE, STOCK_RE, type DocKind, type Numbered, type RegisterKind } from "./detect";
import { usefulLifeOf, type Overrides, type PrimaryCtx } from "./build";

/** Вид документа журнала → бланк альбома. */
export const ALBUM_FORM: Partial<Record<DocKind, string>> = {
  ko1: "ko-1", ko2: "ko-2", ao1: "ao-1", m4: "m-4", m11: "m-11", m15: "m-15", os1: "os-1", os4: "os-4", t49: "t-49", t53: "t-53",
};
export const albumLandscape = (kind: DocKind) => !!(ALBUM_FORM[kind] && FORM_BY_ID[ALBUM_FORM[kind]!]?.landscape);

const low = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Заполнение бланка по подписям полей и граф. */
export class Filler {
  values: FormValues = { f: {}, t: {} };
  constructor(readonly def: FormDef) {}
  /** поле с подписью, подходящей под `re` (n-е совпадение) */
  field(re: RegExp, v: string | undefined, n = 0): this {
    if (v == null || v === "") return this;
    let k = 0;
    for (const [pi, p] of this.def.parts.entries()) {
      if (p.t !== "fields" && p.t !== "sign") continue;
      for (const [ii, it] of (p.t === "fields" ? p.items : p.items).entries()) {
        const label = "label" in it ? it.label : it.role;
        if (re.test(low(label)) && k++ === n) { this.values.f![fieldKey(pi, ii)] = v; return this; }
      }
    }
    return this;
  }
  /** номер и дата у заголовка (первого или n-го) */
  title(no: string, date?: string, n = 0): this {
    let k = 0;
    for (const [pi, p] of this.def.parts.entries()) {
      if (p.t !== "title" || k++ !== n) continue;
      if (p.no) this.values.f![`${pi}.no`] = no;
      if (p.date && date) this.values.f![`${pi}.date`] = dateShort(date);
      break;
    }
    return this;
  }
  /** подзаголовок («за ______ г.») */
  sub(text: string, n = 0): this {
    let k = 0;
    for (const [pi, p] of this.def.parts.entries()) if (p.t === "title" && k++ === n) { this.values.f![`${pi}.sub`] = text; break; }
    return this;
  }
  /** строка таблицы: для каждой графы — первое подходящее правило [подпись графы, значение] */
  row(table: string, map: Array<[RegExp, string]>): this {
    const p = this.def.parts.find((x) => x.t === "table" && x.id === table);
    if (!p || p.t !== "table") return this;
    const row = p.cols.map((c) => map.find(([re]) => re.test(low(c.h)))?.[1] ?? "");
    (this.values.t![table] ??= []).push(row);
    return this;
  }
  build(c: PrimaryCtx): DocBlock[] {
    return this.blocks({
      org: c.companyName, inn: c.inn, director: c.people.director, directorTitle: c.people.directorTitle,
      chief: c.people.chief, cashier: c.people.cashier, storekeeper: c.people.storekeeper,
    });
  }
  blocks(fills: FillValues): DocBlock[] {
    return buildForm(this.def, this.values, fills, false, { pad: false }).blocks;
  }
  /** готовая строка таблицы целиком (порядок граф — как в бланке) */
  rawRow(table: string, row: string[]): this {
    (this.values.t![table] ??= []).push(row);
    return this;
  }
}

const qtyText = (q: number) => String(Math.round(q * 1000) / 1000).replace(".", ",");
function item(l: LedgerLine, o: Overrides, only: boolean) {
  const amount = l.debit || l.credit;
  const over = only && o.qty ? Number(String(o.qty).replace(",", ".")) : NaN;
  const q = Number.isFinite(over) && over > 0 ? over : Number(l.qty ?? 0);
  const unit = (only && o.unit) || l.unit || "";
  return {
    name: (only && o.item) || l.item || l.memo || accountName(l.account),
    unitName: unit ? (findUnit(unit) ? unitSymbol(findUnit(unit)!) : unit) : "", unitCode: unit ? okeiCode(unit) ?? "" : "",
    qty: q > 0 ? qtyText(q) : "", price: q > 0 ? sum(amount / q) : "", amount: sum(amount),
  };
}

/** Документ журнала по бланку альбома; null — у вида нет бланка в альбоме. */
export function albumDoc(kind: DocKind, e: LedgerEntry, number: number, c: PrimaryCtx, o: Overrides = {}): DocBlock[] | null {
  const id = ALBUM_FORM[kind];
  const def = id ? FORM_BY_ID[id] : undefined;
  if (!def) return null;
  const f = new Filler(def);
  const amount = docAmount(e, kind);
  const retail = kind === "ko1" && /^61\d\d$/.test(corrAccount(e, "ko1"));
  const party = o.party || counterpartyOf(e) || (retail ? "Розничные покупатели (наличная выручка)" : "");
  const basis = o.basis || e.description;
  const no = String(number);
  const words = sumInWords(amount);

  switch (kind) {
    case "ko1":
    case "ko2": {
      // кассовые ордера — компактным бланком альбома (квитанция сбоку за линией отреза), по нескольку на листе
      const corr = corrAccount(e, kind);
      return [{ t: "cashOrder", order: {
        kind, org: `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`, number: no, date: dateShort(e.date),
        debit: kind === "ko1" ? "1110" : corr, credit: kind === "ko1" ? corr : "1110", amount: sum(amount), words,
        party, basis, attachment: o.attachment, chief: c.people.chief, cashier: c.people.cashier,
        director: c.people.director, directorTitle: c.people.directorTitle, idDoc: o.idDoc,
      } }];
    }
    case "ao1": {
      const spent = e.lines.filter((l) => l.debit > 0);
      f.title(no, e.date).field(/^фамилия/, party).field(/^назначение аванса/, basis).field(/^проводка №/, no).field(/^от$/, dateShort(e.date));
      for (const l of spent) f.row("d", [[/^дебет\|счет/, l.account], [/^дебет\|сумма/, sum(l.debit)], [/^кредит\|счет/, "1520"], [/^кредит\|сумма/, sum(l.debit)]]);
      for (const l of spent) f.row("list", [[/^дата/, dateShort(e.date)], [/кому, за что/, l.memo || basis], [/^сумма/, sum(l.debit)], [/^дебет\|счет/, l.account]]);
      f.field(/^к утверждению/, sum(amount)).field(/^отчет утверждаю/, `${sum(amount)} (${words})`);
      break;
    }
    case "m4": {
      const lines = e.lines.filter((l) => l.debit > 0 && STOCK_RE.test(l.account));
      const corr = e.lines.find((l) => l.credit > 0)?.account ?? "";
      const vatIn = e.lines.filter((l) => l.debit > 0 && l.account === "1540").reduce((s, l) => s + l.debit, 0);
      f.title(no).row("head", [[/^дата составления/, dateShort(e.date)], [/^поставщик\|наименование/, party], [/^корреспондирующий счет\|счет/, corr], [/сопроводительного/, o.attachment ?? ""]]);
      const net = lines.reduce((s, l) => s + l.debit, 0) || 1;
      for (const l of lines) {
        const r = item(l, o, lines.length === 1);
        const vat = vatIn ? Math.round((vatIn * l.debit) / net * 100) / 100 : 0;
        f.row("t", [[/наименование, сорт/, r.name], [/^единица измерения\|код/, r.unitCode], [/^единица измерения\|наименование/, r.unitName],
          [/^количество\|по документу/, r.qty], [/^количество\|принято/, r.qty], [/^цена/, r.price], [/^сумма без учета ндс/, r.amount],
          [/^сумма ндс/, vat ? sum(vat) : ""], [/^всего с учетом ндс/, sum(l.debit + vat)]]);
      }
      break;
    }
    case "m11":
    case "m15": {
      const lines = e.lines.filter((l) => l.credit > 0 && STOCK_RE.test(l.account));
      const to = e.lines.find((l) => l.debit > 0)?.account ?? "";
      f.title(no).row("head", [[/^дата составления/, dateShort(e.date)], [/^отправитель\|структурное/, "Склад"], [/^получатель\|структурное/, kind === "m11" ? "Производство (цех)" : party], [/^корреспондирующий счет\|счет/, to]]);
      for (const l of lines) {
        const r = item(l, o, lines.length === 1);
        f.row("t", [[/^корреспондирующий счет\|счет/, to], [/^материальные ценности\|наименование/, r.name], [/^единица измерения\|код/, r.unitCode],
          [/^единица измерения\|наименование/, r.unitName], [/затребовано|^количество\|надлежит|^количество$/, r.qty], [/отпущено/, r.qty],
          [/^цена/, r.price], [/^сумма без учета ндс/, r.amount], [/^всего с учетом ндс/, r.amount]]);
      }
      if (kind === "m15") f.field(/^основание/, basis).field(/^кому/, party).field(/^всего отпущено наименований/, String(lines.length)).field(/^на сумму \(прописью\)/, words);
      else f.field(/^разрешил/, c.people.director);
      break;
    }
    case "os1": {
      const line = e.lines.find((l) => l.debit > 0 && FA_RE.test(l.account))!;
      const credit = e.lines.find((l) => l.credit > 0)?.account ?? "";
      const life = usefulLife(line.account, c);
      f.title(no).field(/^дата составления/, dateShort(e.date))
        .row("t1", [[/^сдатчик/, party], [/^получатель/, c.companyName], [/^дебет\|счет/, line.account], [/^кредит\|счет/, credit],
          [/первоначальная/, sum(line.debit)], [/срок полезной службы/, life ? `${life} лет` : ""], [/норма амортизации/, life ? `${Math.round(10000 / life) / 100} %` : ""],
          [/^номер\|инвентарный/, o.invNo ?? ""]])
        .field(/^краткая характеристика/, `${o.item || basis}${c.policy?.depMethod && DEP_METHOD[c.policy.depMethod] ? `; метод амортизации — ${DEP_METHOD[c.policy.depMethod].toLowerCase()}` : ""}`);
      break;
    }
    case "os4": {
      const line = e.lines.find((l) => l.credit > 0 && FA_RE.test(l.account))!;
      const dep = e.lines.filter((l) => l.debit > 0 && /^219\d$/.test(l.account)).reduce((s, l) => s + l.debit, 0);
      const debit = e.lines.find((l) => l.debit > 0 && !/^219\d$/.test(l.account))?.account ?? "";
      f.title(no).field(/^дата составления/, dateShort(e.date))
        .row("t1", [[/^дебет\|счет/, debit], [/^кредит\|счет/, line.account], [/первоначальная/, sum(line.credit)], [/начисленной амортизации/, dep ? sum(dep) : ""], [/^номер\|инвентарный/, o.invNo ?? ""]])
        .field(/^сумма амортизации/, dep ? sum(dep) : "").field(/^заключение комиссии/, o.reason ? `Списать: ${o.reason}` : "");
      break;
    }
    case "t49":
    case "t53": {
      const wages = e.lines.filter((l) => l.debit > 0);
      const [from, to] = monthBounds(e.date);
      f.field(/^в кассу для оплаты/, `с ${dateShort(from)} по ${dateShort(to)}`).field(/^сумма \(прописью и цифрами\)/, `${sum(amount)} (${words})`)
        .field(/^номер документа/, no).field(/^дата составления/, dateShort(e.date)).field(/^отчетный период с/, dateShort(from)).field(/^по$/, dateShort(to));
      if (kind === "t49") wages.forEach((l, i) => f.row("t", [[/^номер по порядку/, String(i + 1)], [/^профессия/, l.memo || accountName(l.account)], [/^начислено, сом\|всего/, sum(l.debit)]]));
      else f.field(/^количество листов/, "1");
      break;
    }
    default:
      return null;
  }
  return f.build(c);
}

const usefulLife = (account: string, c: PrimaryCtx) => usefulLifeOf(account, c.policy);
function monthBounds(iso: string): [string, string] {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${iso.slice(0, 7)}-01`, `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`];
}

// ── регистры за период ────────────────────────────────────────────────────

/** Регистр журнала → бланк альбома. Кассовая книга по дням, книга оплаты труда и книга ОС остаются сводными (lib/primary/build.ts). */
export const ALBUM_REGISTER: Partial<Record<RegisterKind, string>> = {
  ko3: "ko-3", inv15: "inv-15", inv3: "inv-3", inv1: "inv-1", sales: "ip-sales", purchases: "ip-purchases", m2: "m-2",
};
export const albumRegisterLandscape = (kind: RegisterKind) => !!(ALBUM_REGISTER[kind] && FORM_BY_ID[ALBUM_REGISTER[kind]!]?.landscape);

export interface RegisterData {
  inPeriod: LedgerEntry[];
  nums: Map<string, Numbered[]>;
  /** остаток кассы по учёту на конец периода */
  cashBook: number;
  lastKo1: number; lastKo2: number;
  stock: Array<{ account: string; item: string; unit: string; qty: number; amount: number }>;
  fa: Array<{ account: string; name: string; amount: number }>;
}

export function albumRegister(kind: RegisterKind, c: PrimaryCtx, p: { from: string; to: string }, d: RegisterData): DocBlock[] | null {
  const id = ALBUM_REGISTER[kind];
  const def = id ? FORM_BY_ID[id] : undefined;
  if (!def) return null;
  const f = new Filler(def);
  const period = `за период с ${dateShort(p.from)} по ${dateShort(p.to)}`;
  switch (kind) {
    case "ko3": {
      f.sub(period).field(/^должность/, "Главный бухгалтер").field(/^фамилия/, c.people.chief);
      for (const e of d.inPeriod) for (const n of d.nums.get(e.id) ?? []) {
        if (n.kind !== "ko1" && n.kind !== "ko2") continue;
        const a = sum(docAmount(e, n.kind));
        const row: string[] = n.kind === "ko1" ? [dateShort(e.date), String(n.number), a, e.description, "", "", "", ""] : ["", "", "", "", dateShort(e.date), String(n.number), a, e.description];
        (f.values.t!.t ??= []).push(row);
      }
      break;
    }
    case "inv15": {
      f.title("", p.to).field(/^по учетным данным/, `${sum(d.cashBook)} (${sumInWords(d.cashBook)})`)
        .field(/^последние номера кассовых ордеров/, d.lastKo1 ? String(d.lastKo1) : "").field(/^расходного/, d.lastKo2 ? String(d.lastKo2) : "");
      break;
    }
    case "inv3": {
      f.title("", p.to).field(/^произведено снятие/, dateShort(p.to));
      d.stock.forEach((b, i) => {
        const u = b.unit ? findUnit(b.unit) : undefined;
        f.row("t", [[/^номер по порядку/, String(i + 1)], [/^счет/, b.account], [/наименование, характеристика/, b.item || accountName(b.account)],
          [/^единица измерения\|код/, u?.code ?? ""], [/^единица измерения\|наименование/, u ? unitSymbol(u) : b.unit], [/^цена/, b.qty > 0 ? sum(b.amount / b.qty) : ""],
          [/^по данным бухгалтерского учета\|количество/, b.qty ? qtyText(b.qty) : ""], [/^по данным бухгалтерского учета\|сумма/, sum(b.amount)]]);
      });
      break;
    }
    case "inv1": {
      f.title("", p.to).field(/^основные средства$/, "собственные").field(/^находящиеся/, "в собственности субъекта");
      d.fa.forEach((b, i) => f.row("t", [[/^номер по порядку/, String(i + 1)], [/^наименование, назначение/, `${b.name} (счёт ${b.account})`], [/^по данным бухгалтерского учета\|стоимость/, sum(b.amount)]]));
      break;
    }
    case "sales": {
      f.sub(period);
      for (const e of d.inPeriod) {
        const rev = e.lines.filter((l) => /^61\d\d$/.test(l.account)).reduce((s, l) => s + l.credit - l.debit, 0);
        if (rev <= 0) continue;
        const vat = e.lines.filter((l) => l.account === "3430").reduce((s, l) => s + l.credit - l.debit, 0);
        const what = e.lines.find((l) => /^61\d\d$/.test(l.account) && l.item)?.item ?? e.description;
        f.row("t", [[/^№ счета-фактуры/, ""], [/^дата/, dateShort(e.date)], [/^наименование покупателя/, counterpartyOf(e) || "розничные покупатели"], [/^наименование товара/, what],
          [/стандартной ставке/, sum(rev)], [/^ндс/, vat ? sum(vat) : ""]]);
      }
      break;
    }
    case "purchases": {
      f.sub(period);
      let i = 0;
      for (const e of d.inPeriod) {
        const got = e.lines.filter((l) => l.debit > 0 && (STOCK_RE.test(l.account) || FA_RE.test(l.account))).reduce((s, l) => s + l.debit, 0);
        if (!got || !e.lines.some((l) => l.credit > 0 && ["3110", "1210", "1110", "3510"].includes(l.account))) continue;
        const vat = e.lines.filter((l) => l.account === "1540").reduce((s, l) => s + l.debit - l.credit, 0);
        f.row("t", [[/^№ записи/, String(++i)], [/^дата/, dateShort(e.date)], [/^наименование поставщика/, counterpartyOf(e) || ""], [/краткое описание/, e.description],
          [/^стоимость без ндс/, sum(got)], [/^ндс/, vat ? sum(vat) : ""]]);
      }
      break;
    }
    case "m2":
      break;
    default:
      return null;
  }
  return f.build(c);
}

/** Бланк альбома по id для заполнения в других разделах (стройка). */
export const albumFiller = (id: string) => new Filler(FORM_BY_ID[id]);
