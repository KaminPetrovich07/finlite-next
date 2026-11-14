// Накладная на возврат: от покупателя (товар вернулся на склад) или поставщику (товар ушёл со склада).
// Форма организации (ПП № 231, п. 17): стороны, основание, товары в натуральном и денежном выражении, подписи.
import { dateLong, sum, sumInWords, type DocBlock } from "@/lib/docs/model";
import type { PrimaryCtx } from "@/lib/primary/build";
import { docTotals, type TradeDoc } from "./doc";

const q = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

export function returnBlocks(doc: TradeDoc, c: Pick<PrimaryCtx, "companyName" | "inn" | "people">, base?: { number: string; date: string } | null): DocBlock[] {
  const t = docTotals(doc);
  const fromCustomer = doc.type === "saleReturn";
  const us = `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`;
  const them = `${doc.party || "—"}${doc.partyInn ? `, ИНН ${doc.partyInn}` : ""}`;
  const withVat = t.vat > 0;
  const rows = doc.rows.map((r, i) => {
    const x = t.rows[i];
    return withVat
      ? [String(i + 1), r.name, r.unit, q(r.qty), sum(x.net / (r.qty || 1)), sum(x.net), sum(x.vat), sum(x.gross)]
      : [String(i + 1), r.name, r.unit, q(r.qty), sum(x.gross / (r.qty || 1)), sum(x.gross)];
  });
  rows.push(withVat ? ["", "Итого", "", "", "", sum(t.net), sum(t.vat), sum(t.gross)] : ["", "Итого", "", "", "", sum(t.gross)]);
  const basis = base ? `возврат по ${fromCustomer ? "накладной" : "поступлению"} № ${base.number} от ${base.date.split("-").reverse().join(".")}` : doc.basis || "";
  return [
    { t: "p", text: us, bold: true },
    { t: "title", text: `${fromCustomer ? "Накладная на возврат товаров от покупателя" : "Накладная на возврат товаров поставщику"} № ${doc.number}` },
    { t: "p", text: `от ${dateLong(doc.date)}`, align: "c" },
    { t: "fields", items: fromCustomer
      ? [["Покупатель (возвращает)", them], ["Поставщик (принимает)", us], ...(basis ? [["Основание", basis] as [string, string]] : [])]
      : [["Покупатель (возвращает)", us], ["Поставщик (принимает)", them], ...(basis ? [["Основание", basis] as [string, string]] : [])] },
    {
      t: "table", rows, total: true, small: withVat,
      head: withVat ? ["№", "Наименование", "Ед.", "Кол-во", "Цена без НДС", "Сумма без НДС", "НДС", "Всего"] : ["№", "Наименование", "Ед.", "Кол-во", "Цена", "Сумма"],
      widths: withVat ? [0.5, 5, 0.9, 1.1, 1.4, 1.7, 1.4, 1.7] : [0.6, 6.4, 1, 1.3, 1.7, 2],
      align: withVat ? ["c", "l", "c", "r", "r", "r", "r", "r"] : ["c", "l", "c", "r", "r", "r"],
    },
    { t: "p", text: `Всего возвращено на сумму ${sumInWords(t.gross)}${withVat ? `, в том числе НДС ${sum(t.vat)} сом` : ""}.` },
    ...(withVat ? [{ t: "note", text: fromCustomer ? "Корректировочный счёт-фактура выписывается в ИС ЭСФ продавцом." : "Корректировочный счёт-фактура выписывается в ИС ЭСФ поставщиком." } as DocBlock] : []),
    { t: "sign", items: fromCustomer
      ? [{ role: "Сдал (покупатель)", name: "" }, { role: "Принял", name: c.people.storekeeper }, { role: c.people.directorTitle, name: c.people.director }]
      : [{ role: "Отпустил", name: c.people.storekeeper }, { role: "Получил (поставщик)", name: "" }, { role: c.people.directorTitle, name: c.people.director }] },
  ];
}
