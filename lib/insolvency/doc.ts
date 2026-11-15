// Заключение о финансовом состоянии (PDF / Word) по результатам диагностики.
import { dateShort, sum, type DocBlock, type OfficialDoc } from "@/lib/docs/model";
import type { Diagnosis } from "./diagnose";
import { translate } from "@/lib/i18n";

const ru = (text: string, vars?: Record<string, string | number>) => translate("ru", text, vars);

const LEVEL = { ok: "норма", watch: "внимание", risk: "риск" } as const;
const val = (v: number | null, unit: string) => (v == null ? "—" : unit === "%" ? `${v} %` : unit === "мес" ? `${String(v).replace(".", ",")} мес.` : String(v).replace(".", ","));

export function buildDiagnosisDoc(org: { name: string; inn: string | null }, d: Diagnosis): OfficialDoc {
  const b: DocBlock[] = [
    { t: "right", lines: ["Аналитическая справка FinLite"], small: true },
    { t: "title", text: "Заключение о финансовом состоянии" },
    { t: "p", text: `${org.name}${org.inn ? `, ИНН ${org.inn}` : ""} — на ${dateShort(d.asOf)}`, align: "c" },
    { t: "h", text: `Вывод: ${d.verdict.title}` },
    { t: "p", text: d.verdict.detail, indent: true },
    { t: "h", text: "1. Признаки, требующие внимания" },
    d.signals.length ? { t: "list", items: d.signals.map((s) => `${s.level === "risk" ? "[риск] " : "[внимание] "}${ru(s.title, s.vars)}. ${ru(s.detail, s.vars)}`) } : { t: "p", text: "Не выявлено.", indent: true },
    { t: "h", text: "2. Показатели" },
    { t: "table", head: ["Показатель", "Значение", "Ориентир", "Оценка"], rows: d.indicators.map((i) => [i.label, val(i.value, i.unit), i.norm, LEVEL[i.level]]), widths: [4, 1.6, 4, 1.4], align: ["l", "r", "l", "c"], small: true },
    ...(d.altman ? [{ t: "p" as const, small: true, text: `Модель Альтмана Z'' (1995, для непроизводственных компаний): Z = ${String(d.altman.z).replace(".", ",")} — ${d.altman.zone === "safe" ? "зона устойчивости (выше 2,6)" : d.altman.zone === "grey" ? "серая зона (1,1–2,6)" : "зона высокого риска (ниже 1,1)"}. Ориентир международной практики, не норма законодательства КР.` }] : []),
    { t: "h", text: "3. Динамика по месяцам" },
    { t: "table", head: ["Месяц", "Текущая ликв.", "Быстрая ликв.", "Просрочено, сом", "Капитал, сом", "Чистая прибыль, сом"],
      rows: d.months.map((m) => [m.month, val(m.current, "x"), val(m.quick, "x"), sum(m.overdue), sum(m.equity), sum(m.netProfit)]), widths: [1.4, 1.5, 1.5, 2.2, 2.4, 2.4], align: ["c", "r", "r", "r", "r", "r"], small: true },
    { t: "h", text: "4. Структура задолженности по видам кредиторов" },
    { t: "table", head: ["Вид кредиторов", "Кредиторов", "Долг, сом", "Не погашено в срок, сом"],
      rows: [...d.totals.byKind.map((k) => [k.label, String(k.count), sum(k.amount), sum(k.overdue)]), ["Итого", "", sum(d.totals.debts), sum(d.totals.overdue)]], widths: [4.5, 1.5, 2.5, 2.8], align: ["l", "c", "r", "r"], total: true, small: true },
    { t: "h", text: "5. Перечень кредиторов" },
    { t: "table", head: ["Кредитор", "Вид", "Счета", "Долг, сом", "С какой даты", "Не погашено в срок, сом"],
      rows: d.debts.map((x) => [x.interest ? `${x.creditor} — проценты` : x.creditor, x.kind === "budget" ? "бюджет" : x.kind === "staff" ? "работники" : x.kind === "lenders" ? "кредиты" : x.kind === "suppliers" ? "поставщики" : x.kind === "customers" ? "авансы" : x.kind === "owners" ? "участники" : "прочие", x.accounts.join(", "), sum(x.amount), dateShort(x.oldest), x.overdue ? sum(x.overdue) : "—"]),
      widths: [3.6, 1.6, 1.6, 2, 1.6, 2.2], align: ["l", "l", "c", "r", "c", "r"], small: true },
    { t: "note", text: `Как считалось. Долги — по данным журнала проводок, погашения закрывают самую раннюю часть долга того же кредитора. «Не погашено в срок» — дольше ${d.terms.suppliers} дней поставщикам, ${d.terms.staff} дней по зарплате, ${d.terms.budget} дней по ежемесячным налогам и взносам и ${d.terms.quarterlyTax} дней по налогу на прибыль (единому налогу). Тело кредитов гасится по графику договора и здесь не считается просроченным. Признак неплатёжеспособности — по ст. 3 Закона КР «О банкротстве (несостоятельности)»: обязательства, не погашенные в срок, превышают ликвидные активы. Очерёдность требований при банкротстве определяется ст. 85–87 этого Закона; группы в таблице — по видам долга, а не по очередям. Справка не является заключением специального администратора или аудитора.` },
  ];
  return { title: `Финансовая диагностика — ${org.name}`, fileName: `Финансовая диагностика — ${org.name} — ${d.asOf}`, org: org.name, blocks: b };
}
