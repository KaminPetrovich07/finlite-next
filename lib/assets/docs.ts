// Документы по основным средствам из карточек: акт ОС-1, инвентарная
// карточка ОС-6, ведомость начисления амортизации за месяц.
import { dateLong, dateShort, sum, type DocBlock } from "@/lib/docs/model";
import type { People } from "@/lib/primary/build";
import { accountName } from "@/lib/ledger/accounts";
import { bookSchedule, depreciationLines, monthEnd } from "./depreciation";
import { ASSET_ACCOUNTS, ACCUMULATED, BOOK_METHOD, TAX_GROUPS, type FixedAsset } from "./types";

interface Ctx { companyName: string; inn: string; people: People }

const org = (c: Ctx): DocBlock => ({ t: "p", text: `${c.companyName}${c.inn ? `, ИНН ${c.inn}` : ""}`, bold: true });
const kindOf = (a: FixedAsset) => ASSET_ACCOUNTS.find((x) => x.code === a.account)?.title ?? accountName(a.account);
const life = (a: FixedAsset) => (a.lifeMonths ? `${a.lifeMonths} мес. (${(a.lifeMonths / 12).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} г.)` : "не амортизируется");

export function os1(a: FixedAsset, c: Ctx): DocBlock[] {
  return [
    { t: "right", lines: ["Унифицированная форма ОС-1"], small: true },
    org(c),
    { t: "right", lines: ["УТВЕРЖДАЮ", `${c.people.directorTitle} ____________ ${c.people.director}`, "«___» ____________ 20__ г."] },
    { t: "title", text: `Акт (накладная) приёмки-передачи основных средств № ${a.inventoryNo}` },
    { t: "p", text: `от ${dateLong(a.inServiceAt)}`, align: "c" },
    { t: "table", head: ["Дата приобретения", "Дата ввода в эксплуатацию", "Счёт", "Инвентарный номер", "Сдатчик (поставщик)"],
      rows: [[dateShort(a.acquiredAt), dateShort(a.inServiceAt), a.account, a.inventoryNo, a.supplier]], widths: [2, 2, 1, 2, 4], align: ["c", "c", "c", "c", "l"] },
    { t: "table", head: ["Наименование объекта", "Вид", "Первоначальная стоимость, сом", "Ликвидационная стоимость, сом", "Срок полезного использования", "Метод амортизации"],
      rows: [[a.name, kindOf(a), sum(a.cost), a.residual ? sum(a.residual) : "—", life(a), a.lifeMonths ? BOOK_METHOD[a.method] : "—"]], widths: [4, 3, 2, 2, 2.5, 2.5], align: ["l", "l", "r", "r", "c", "l"] },
    { t: "fields", items: [
      ["Место нахождения", a.location],
      ["Материально ответственное лицо", a.responsible],
      ["Налоговая группа (ст. 226 НК КР)", a.taxGroup ? `${a.taxGroup} — ${TAX_GROUPS[a.taxGroup].title}, норма ${TAX_GROUPS[a.taxGroup].rate * 100} %` : "не амортизируется / ниже порога"],
      ["Счёт расходов на амортизацию", `${a.expenseAccount} ${accountName(a.expenseAccount)}`],
    ] },
    { t: "p", text: "Объект технически исправен, комплектен, соответствует условиям договора и принят в эксплуатацию.", small: true },
    { t: "p", text: "Приёмочная комиссия:", bold: true },
    { t: "sign", items: [{ role: "Председатель комиссии", name: c.people.director }, { role: "Член комиссии", name: "" }, { role: "Член комиссии", name: "" }, { role: "Объект сдал", name: "" }, { role: "Объект принял", name: a.responsible }, { role: "Главный бухгалтер", name: c.people.chief }] },
  ];
}

export function os6(a: FixedAsset, c: Ctx, ym: string): DocBlock[] {
  const sched = bookSchedule(a, ym);
  const byYear = new Map<string, number>();
  for (const r of sched) byYear.set(r.ym.slice(0, 4), (byYear.get(r.ym.slice(0, 4)) ?? 0) + r.amount);
  const acc = sched.length ? sched[sched.length - 1].accumulated : a.openingAccumulated;
  return [
    { t: "right", lines: ["Унифицированная форма ОС-6"], small: true },
    org(c),
    { t: "title", text: `Инвентарная карточка учёта основного средства № ${a.inventoryNo}` },
    { t: "fields", items: [
      ["Наименование", a.name], ["Вид", kindOf(a)], ["Счёт учёта / накопленной амортизации", `${a.account} / ${ACCUMULATED[a.account] ?? "—"}`],
      ["Дата приобретения / ввода", `${dateShort(a.acquiredAt)} / ${dateShort(a.inServiceAt)}`], ["Первоначальная стоимость", `${sum(a.cost)} сом`],
      ["Срок полезного использования", life(a)], ["Метод", a.lifeMonths ? BOOK_METHOD[a.method] : "—"],
      ["Накопленная амортизация на " + dateShort(monthEnd(ym)), `${sum(acc)} сом`], ["Остаточная стоимость", `${sum(a.cost - acc)} сом`],
      ["Место нахождения / ответственный", [a.location, a.responsible].filter(Boolean).join(" / ")],
      ...(a.disposedAt ? [["Выбытие", `${dateShort(a.disposedAt)}${a.disposalProceeds ? `, продажа за ${sum(a.disposalProceeds)} сом` : ", списание"}${a.disposalReason ? `; ${a.disposalReason}` : ""}`] as [string, string]] : []),
    ] },
    ...(byYear.size ? [{ t: "table" as const, head: ["Год", "Начислено амортизации, сом"], rows: [...byYear].map(([y, v]) => [y, sum(v)]), widths: [2, 3], align: ["c", "r"] as ("c" | "r")[], small: true }] : []),
    { t: "sign", items: [{ role: "Бухгалтер", name: c.people.chief }] },
  ];
}

export function depreciationSheet(assets: FixedAsset[], c: Ctx, ym: string): DocBlock[] {
  const d = depreciationLines(assets, ym);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const rows = d.rows.map((r, i) => {
    const a = byId.get(r.id)!;
    const acc = bookSchedule(a, ym).at(-1)?.accumulated ?? 0;
    return [String(i + 1), a.inventoryNo, a.name, `${a.expenseAccount} / ${ACCUMULATED[a.account]}`, sum(a.cost), sum(r.amount), sum(acc), sum(a.cost - acc)];
  });
  rows.push(["", "", "Итого", "", sum(d.rows.reduce((s, r) => s + byId.get(r.id)!.cost, 0)), sum(d.total), "", ""]);
  return [
    org(c),
    { t: "title", text: "Ведомость начисления амортизации основных средств и нематериальных активов" },
    { t: "p", text: `за ${ym.slice(5, 7)}.${ym.slice(0, 4)} г.`, align: "c" },
    { t: "table", head: ["№", "Инв. №", "Объект", "Дт / Кт", "Стоимость", "Амортизация за месяц", "Накоплено", "Остаточная"],
      rows, widths: [0.6, 1.4, 5, 1.6, 2, 2, 2, 2], align: ["c", "c", "l", "c", "r", "r", "r", "r"], total: true, small: true },
    { t: "sign", items: [{ role: "Составил", name: c.people.chief }, { role: "Проверил", name: "" }] },
  ];
}
