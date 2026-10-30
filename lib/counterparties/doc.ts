// Акт сверки взаимных расчётов (неунифицированная форма) и акт
// инвентаризации дебиторской задолженности и обязательств ИНВ-17 со справкой
// (альбом форм первичных документов, ПП № 231).
import { dateLong, dateShort, sum, sumInWords, type DocBlock, type OfficialDoc } from "@/lib/docs/model";
import type { People } from "@/lib/primary/build";
import { SETTLE, type Counterparty } from "./types";
import type { CpResult, CpRow } from "./calc";

interface Org { name: string; inn: string; people: People }

/** Акт сверки с одним контрагентом за период. */
export function buildReconciliationAct(org: Org, row: CpRow, card: Counterparty | undefined, from: string, to: string): OfficialDoc {
  const ops = row.movements.filter((m) => m.entryId !== "opening" && m.date >= from && m.date <= to);
  const open = row.openingNet;
  const dr = ops.reduce((s, m) => s + m.debit, 0), cr = ops.reduce((s, m) => s + m.credit, 0);
  const close = Math.round((open + dr - cr) * 100) / 100;
  const side = (n: number): [string, string] => (n > 0.004 ? [sum(n), ""] : n < -0.004 ? ["", sum(-n)] : ["", ""]);
  const them = row.name;
  const rows: string[][] = [
    ["", `Сальдо на ${dateShort(from)}`, ...side(open), "", ""],
    ...ops.map((m) => [dateShort(m.date), m.text + (m.account ? ` (сч. ${m.account})` : ""), m.debit ? sum(m.debit) : "", m.credit ? sum(m.credit) : "", "", ""]),
    ["", "Обороты за период", sum(dr), sum(cr), "", ""],
    ["", `Сальдо на ${dateShort(to)}`, ...side(close), "", ""],
  ];
  const whose = close > 0.004 ? `в пользу ${org.name}` : close < -0.004 ? `в пользу ${them}` : "";
  const b: DocBlock[] = [
    { t: "right", lines: ["Неунифицированная форма"], small: true },
    { t: "title", text: "Акт сверки взаимных расчётов" },
    { t: "p", text: `за период с ${dateShort(from)} по ${dateShort(to)}`, align: "c" },
    { t: "p", text: `между ${org.name}${org.inn ? ` (ИНН ${org.inn})` : ""} и ${them}${row.inn ? ` (ИНН ${row.inn})` : ""}${card?.contract ? `, договор ${card.contract}` : ""}`, align: "c" },
    { t: "p", indent: true, text: `Мы, нижеподписавшиеся, ${org.people.directorTitle || "руководитель"} ${org.name} ${org.people.director || "____________"} и главный бухгалтер ${org.people.chief || "____________"}, с одной стороны, и представитель ${them} ____________________, с другой стороны, составили настоящий акт о том, что состояние взаимных расчётов по данным учёта следующее:` },
    { t: "table", head: ["Дата", "Документ (операция)", `${org.name}: дебет`, "кредит", `${them}: дебет`, "кредит"], rows, widths: [1.5, 5, 1.9, 1.9, 1.9, 1.9], align: ["c", "l", "r", "r", "r", "r"], small: true },
    { t: "p", indent: true, text: whose
      ? `По данным ${org.name} на ${dateShort(to)} задолженность ${whose} составляет ${sum(Math.abs(close))} сом (${sumInWords(Math.abs(close))}).`
      : `По данным ${org.name} на ${dateShort(to)} задолженность отсутствует.` },
    { t: "p", indent: true, text: `По данным ${them} на ${dateShort(to)} задолженность ________________________ составляет ____________________ сом.` },
    { t: "note", text: "Просим подписать акт и вернуть один экземпляр в течение 10 рабочих дней. При расхождениях приложите перечень операций, по которым они возникли." },
    { t: "p", text: `От ${org.name}:`, bold: true },
    { t: "sign", items: [{ role: org.people.directorTitle || "Руководитель", name: org.people.director }, { role: "Главный бухгалтер", name: org.people.chief }] },
    { t: "p", text: `От ${them}:`, bold: true },
    { t: "sign", items: [{ role: "Руководитель", name: "" }, { role: "Главный бухгалтер", name: "" }] },
  ];
  return { title: `Акт сверки — ${them}`, fileName: `Акт сверки — ${them} — ${from}…${to}`, org: org.name, blocks: b };
}

const LIMITATION_DAYS = 3 * 365; // общий срок исковой давности — 3 года (ГК КР)

interface Line { name: string; acc: string; total: number; confirmed: number; expired: number; row?: CpRow }

/** ИНВ-17 + справка к нему на дату. */
export function buildInv17(org: Org, res: CpResult, cards: Counterparty[], order: { number: string; date: string }): OfficialDoc {
  const card = new Map(cards.map((c) => [c.id, c]));
  const debt: Line[] = [], cred: Line[] = [];
  for (const r of res.rows) {
    for (const [acc, bal] of Object.entries(r.balances)) {
      if (Math.abs(bal) < 0.005) continue;
      const items = acc === "1410" ? r.openRecv : acc === "3110" ? r.openPay : [];
      const expired = items.filter((i) => i.age > LIMITATION_DAYS).reduce((s, i) => s + i.amount, 0);
      const line: Line = { name: r.name, acc, total: Math.abs(bal), confirmed: r.confirmed ? Math.abs(bal) : 0, expired, row: r };
      (bal > 0 ? debt : cred).push(line);
    }
  }
  for (const [acc, bal] of Object.entries(res.unassigned.balances)) {
    const line: Line = { name: "Без указания контрагента", acc, total: Math.abs(bal), confirmed: 0, expired: 0 };
    (bal > 0 ? debt : cred).push(line);
  }
  const sortL = (a: Line, b: Line) => a.acc.localeCompare(b.acc) || b.total - a.total;
  debt.sort(sortL); cred.sort(sortL);
  const table = (ls: Line[]): string[][] => [
    ...ls.map((l) => [`${SETTLE[l.acc]?.short ?? l.acc}: ${l.name}`, l.acc, sum(l.total), l.confirmed ? sum(l.confirmed) : "", sum(l.total - l.confirmed), l.expired ? sum(l.expired) : ""]),
    ["Итого", "", sum(ls.reduce((s, l) => s + l.total, 0)), sum(ls.reduce((s, l) => s + l.confirmed, 0)), sum(ls.reduce((s, l) => s + l.total - l.confirmed, 0)), sum(ls.reduce((s, l) => s + l.expired, 0))],
  ];
  const head = ["Наименование счёта и дебитора", "Номер счёта", "Всего", "Подтверждённая", "Не подтверждённая", "С истекшим сроком исковой давности"];
  const widths = [6, 1.4, 2.2, 2.2, 2.2, 2.4];
  const align: Array<"l" | "c" | "r"> = ["l", "c", "r", "r", "r", "r"];
  const sinceOf = (l: Line) => {
    const items = l.acc === "1410" ? l.row?.openRecv : l.acc === "3110" ? l.row?.openPay : undefined;
    if (items?.length) return dateShort(items[0].date);
    const first = l.row?.movements.find((m) => m.account === l.acc);
    return first ? dateShort(first.date) : "";
  };
  const spravka = (ls: Line[]): string[][] => [
    ...ls.map((l, i) => {
      const c = l.row ? card.get(l.row.id) : undefined;
      return [String(i + 1), l.name, c?.address ?? "", SETTLE[l.acc]?.label ?? l.acc, sinceOf(l), sum(l.total), c?.contract ? "Договор" : "", c?.contract ?? "", l.confirmed ? "акт сверки подписан" : ""];
    }),
    ["", "Итого", "", "", "", sum(ls.reduce((s, l) => s + l.total, 0)), "", "", ""],
  ];
  const spHead = ["№", "Наименование", "Адрес", "За что числится", "Дата образования", "Сумма, сом", "Документ", "Номер, дата", "Примечание"];
  const spW = [0.6, 3.6, 3, 3.2, 1.6, 2, 1.4, 2, 2];
  const spA: Array<"l" | "c" | "r"> = ["c", "l", "l", "l", "c", "r", "l", "l", "l"];
  const commission = [{ role: "Председатель комиссии", name: org.people.director }, { role: "Член комиссии", name: org.people.chief }, { role: "Член комиссии", name: "" }];

  const b: DocBlock[] = [
    { t: "right", lines: ["Унифицированная форма № ИНВ-17", `ИНН ${org.inn || "____________"}`], small: true },
    { t: "p", text: org.name, bold: true },
    { t: "fields", items: [["Основание для проведения инвентаризации", order.number ? `приказ № ${order.number}${order.date ? ` от ${dateShort(order.date)}` : ""}` : "приказ № ____ от ____________"], ["Дата составления", dateShort(res.asOf)]] },
    { t: "title", text: "Акт инвентаризации дебиторской задолженности и обязательств" },
    { t: "p", indent: true, text: `Акт составлен комиссией о том, что по состоянию на ${dateLong(res.asOf)} проведена инвентаризация расчётов с покупателями, поставщиками и прочими дебиторами и кредиторами. При инвентаризации установлено следующее:` },
    { t: "h", text: "1. По дебиторской задолженности, сом", level: 2 },
    { t: "table", head, rows: table(debt), widths, align, small: true, total: true },
    { t: "h", text: "2. По обязательствам, сом", level: 2 },
    { t: "table", head: head.map((h, i) => (i === 0 ? "Наименование счёта и кредитора" : h)), rows: table(cred), widths, align, small: true, total: true },
    { t: "p", text: "Все подсчёты итогов по строкам, страницам и в целом по акту инвентаризации проверены.", small: true },
    { t: "sign", items: commission },
    { t: "pagebreak" },
    { t: "right", lines: ["Приложение к форме № ИНВ-17", "Неунифицированная форма"], small: true },
    { t: "p", text: org.name, bold: true },
    { t: "title", text: "Справка" },
    { t: "p", text: `к акту инвентаризации задолженности по состоянию на ${dateLong(res.asOf)}`, align: "c" },
    { t: "h", text: "Дебиторы", level: 2 },
    { t: "table", head: spHead, rows: spravka(debt), widths: spW, align: spA, small: true, total: true },
    { t: "h", text: "Кредиторы", level: 2 },
    { t: "table", head: spHead, rows: spravka(cred), widths: spW, align: spA, small: true, total: true },
    { t: "sign", items: [{ role: "Бухгалтер", name: org.people.chief }] },
  ];
  return { title: `ИНВ-17 — ${org.name}`, fileName: `ИНВ-17 Инвентаризация расчётов — ${org.name} — ${res.asOf}`, org: org.name, landscape: true, blocks: b };
}
