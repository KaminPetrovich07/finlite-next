// Обзор портфеля для руководства (PDF / Word): сколько компаний в риске, кто именно и почему.
import { dateShort, sum, type DocBlock, type OfficialDoc } from "@/lib/docs/model";
import { translate } from "@/lib/i18n";
import type { PortfolioRow, PortfolioSummary } from "./score";

const ru = (text: string, vars?: Record<string, string | number>) => translate("ru", text, vars);
const BAND = { ok: "устойчиво", watch: "внимание", risk: "высокий риск" } as const;
const x = (v: number | null) => (v == null ? "—" : String(v).replace(".", ","));

export function buildPortfolioDoc(title: string, asOf: string, rows: PortfolioRow[], s: PortfolioSummary): OfficialDoc {
  const live = rows.filter((r) => !r.empty);
  const risky = live.filter((r) => r.band === "risk");
  const b: DocBlock[] = [
    { t: "right", lines: ["Аналитическая справка FinLite"], small: true },
    { t: "title", text: "Финансовое состояние портфеля" },
    { t: "p", text: `${title} — на ${dateShort(asOf)}`, align: "c" },
    { t: "h", text: "Главное" },
    { t: "list", items: [
      `Компаний: ${s.companies}. Устойчивы — ${s.ok}, требуют внимания — ${s.watch}, в зоне высокого риска — ${s.risk}.`,
      `Не погашено в срок: ${sum(s.overdue)} сом, в том числе зарплата — ${sum(s.overdueStaff)} сом, бюджет и Социальный фонд — ${sum(s.overdueBudget)} сом.`,
      `Выручка за последние 3 месяца: ${sum(s.revenue3)} сом; чистый результат: ${sum(s.profit3)} сом; убыточных компаний: ${s.lossMaking}.`,
    ] },
    ...(risky.length ? [
      { t: "h" as const, text: "Высокий риск: что происходит" },
      { t: "list" as const, items: risky.map((r) => `${r.name} — балл ${r.score}: ${r.parts.map((p) => p.label.toLowerCase()).join(", ")}${r.topSignal ? `. ${ru(r.topSignal.detail, r.topSignal.vars)}` : ""}`) },
    ] : []),
    { t: "h", text: "Все компании" },
    { t: "table", head: ["Компания", "Балл риска", "Оценка", "Текущая ликв.", "Покрытие просроч.", "Просрочено, сом", "в т. ч. зарплата", "в т. ч. бюджет", "Результат 3 мес., сом"],
      rows: live.map((r) => [r.name, String(r.score), BAND[r.band], x(r.current), x(r.coverage), sum(r.overdue), r.overdueStaff ? sum(r.overdueStaff) : "—", r.overdueBudget ? sum(r.overdueBudget) : "—", sum(r.profit3)]),
      widths: [4, 1.2, 1.6, 1.3, 1.4, 2, 1.8, 1.8, 2], align: ["l", "c", "c", "r", "r", "r", "r", "r", "r"], small: true },
    { t: "note", text: "Балл риска 0–100 складывается из видимых признаков: недостаточность активов (35), просроченного больше ликвидных активов (30), задержка зарплаты (15), просрочка перед бюджетом (10), просрочка поставщикам (10), поставщикам не платят больше 120 дней (10), текущая ликвидность ниже 1 (10), падение ликвидности, убыток или нехватка денег (по 5), высокие налоговые риски (по 3, до 9). 0–19 — устойчиво, 20–49 — внимание, 50 и выше — высокий риск. Признак неплатёжеспособности — по ст. 3 Закона КР «О банкротстве (несостоятельности)». Расчёт по данным учёта компаний; справка не является аудиторским заключением." },
  ];
  return { title: `Портфель — ${title}`, fileName: `Портфель — ${title} — ${asOf}`, org: title, blocks: b, landscape: true } as OfficialDoc;
}
