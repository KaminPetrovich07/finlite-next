// ════════════════════════════════════════════════════════════════════════
// lib/reported/template.ts — шаблон Excel для отчётности предприятий
// (и пример, заполненный демо-данными). Один лист — одно предприятие.
// Итоговые строки (Б6, Б8, Б15, Д4) — формулы: предприятие сразу видит,
// сходится ли баланс. Только сервер (ExcelJS).
// ════════════════════════════════════════════════════════════════════════

import ExcelJS from "exceljs";
import { HEAD, LINES, MODES, SECTIONS, UNITS, type LineKey, type ReportedCompany } from "./reported";

const FORMULA: Partial<Record<LineKey, (col: string, row: (code: string) => number) => string>> = {
  currentTotal: (c, r) => `SUM(${c}${r("Б1")}:${c}${r("Б5")})`,
  assetsTotal: (c, r) => `${c}${r("Б6")}+${c}${r("Б7")}`,
  equity: (c, r) => `${c}${r("Б8")}-${c}${r("Б9")}-${c}${r("Б14")}`,
  operatingProfit: (c, r) => `${c}${r("Д1")}-${c}${r("Д2")}-${c}${r("Д3")}`,
};

/** Последние n кварталов, закончившихся до даты. */
export function lastQuarters(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const qEnd = Math.floor((m - 1) / 3) * 3; // месяц конца последнего закончившегося квартала (0 = прошлый год)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, qEnd - 3 * (n - 1 - i), 0)).toISOString().slice(0, 10));
}

const isoToDate = (d: string) => new Date(`${d}T00:00:00Z`);

function addSheet(wb: ExcelJS.Workbook, title: string, c: ReportedCompany | null, dates: string[]) {
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Предприятие", { views: [{ state: "frozen", xSplit: 2, ySplit: 9 }] });
  ws.columns = [{ width: 7 }, { width: 62 }, ...dates.map(() => ({ width: 16 }))];
  const bold = { bold: true } as const;
  ws.getCell("A1").value = "Отчётность предприятия для мониторинга финансового состояния";
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = "Шаблон FinLite KG — не официальная форма отчётности. Заполняются белые ячейки; серые строки считаются сами.";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  const head: Array<[string, string]> = [
    [HEAD.name, c?.name ?? ""], [HEAD.inn, c?.inn ?? ""], [HEAD.segment, c?.segment ?? ""],
    [HEAD.unit, c?.unit ?? UNITS[0]], [HEAD.mode, c?.mode ?? MODES[0]],
  ];
  head.forEach(([k, v], i) => {
    const r = 3 + i;
    ws.getCell(`A${r}`).value = k; ws.getCell(`A${r}`).font = bold;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`C${r}`).value = v;
    if (dates.length > 1) ws.mergeCells(`C${r}:${ws.getColumn(2 + dates.length).letter}${r}`);
    ws.getCell(`C${r}`).border = { bottom: { style: "thin" } };
    if (k === HEAD.inn) ws.getCell(`C${r}`).numFmt = "@";
  });
  ws.getCell("C6").dataValidation = { type: "list", allowBlank: false, formulae: [`"${UNITS.join(",")}"`] };
  ws.getCell("C7").dataValidation = { type: "list", allowBlank: false, formulae: [`"${MODES.join(",")}"`] };

  const H = 9;
  ws.getCell(`A${H}`).value = HEAD.code; ws.getCell(`B${H}`).value = "Показатель / дата окончания периода";
  dates.forEach((d, i) => { const cell = ws.getRow(H).getCell(3 + i); cell.value = isoToDate(d); cell.numFmt = "dd.mm.yyyy"; });
  ws.getRow(H).font = bold;
  ws.getRow(H).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF2" } }; cell.border = { bottom: { style: "thin" } }; });

  // строки: заголовок раздела, затем линии раздела
  const rowOf = new Map<string, number>();
  let r = H + 1;
  const plan: Array<{ section?: 1 | 2 | 3 | 4; line?: (typeof LINES)[number] }> = [];
  for (const s of [1, 2, 3, 4] as const) { plan.push({ section: s }); for (const l of LINES.filter((x) => x.section === s)) plan.push({ line: l }); }
  for (const p of plan) { if (p.line) rowOf.set(p.line.code, r); r++; }
  const row = (code: string) => rowOf.get(code)!;

  // значения в единице и режиме отчёта
  const k = c?.unit === "тыс. сом" ? 1000 : 1;
  const cumulative = c?.mode === MODES[1];
  const shown = (key: LineKey, i: number): number | null => {
    const p = c?.periods.find((x) => x.date === dates[i]);
    if (!p || p.values[key] == null) return null;
    const line = LINES.find((l) => l.key === key)!;
    let v = p.values[key]!;
    if (cumulative && line.flow) for (const q of c!.periods) if (q.date < p.date && q.date.slice(0, 4) === p.date.slice(0, 4)) v += q.values[key] ?? 0;
    return key === "headcount" ? v : Math.round((v / k) * 10) / 10;
  };

  r = H + 1;
  for (const p of plan) {
    const xr = ws.getRow(r);
    if (p.section) {
      xr.getCell(1).value = SECTIONS[p.section];
      ws.mergeCells(r, 1, r, 2 + dates.length);
      xr.font = bold;
      xr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F1E8" } };
    } else if (p.line) {
      const l = p.line;
      xr.getCell(1).value = l.code;
      xr.getCell(2).value = l.label;
      if (l.indent) xr.getCell(2).alignment = { indent: 2 };
      dates.forEach((_, i) => {
        const cell = xr.getCell(3 + i);
        const col = ws.getColumn(3 + i).letter;
        const f = FORMULA[l.key];
        if (f) {
          cell.value = { formula: f(col, row), result: shown(l.key, i) ?? 0 } as ExcelJS.CellFormulaValue;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
          cell.font = bold;
        } else {
          const v = shown(l.key, i);
          if (v != null) cell.value = v;
        }
        cell.numFmt = l.key === "headcount" ? "0" : k === 1000 ? "#,##0.0" : "#,##0";
        cell.border = { bottom: { style: "hair", color: { argb: "FFCCCCCC" } } };
      });
      if (l.control) xr.getCell(2).font = bold;
    }
    r++;
  }
  ws.getCell(`A${r + 1}`).value = "Сверка: Б15 должен совпадать с собственным капиталом по балансу; просроченная задолженность (раздел 3) не может быть больше соответствующей строки Б10–Б13.";
  ws.getCell(`A${r + 1}`).font = { italic: true, color: { argb: "FF666666" } };
}

function addGuide(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Как заполнить");
  ws.columns = [{ width: 110 }];
  [
    "Как заполнить отчётность для FinLite KG",
    "",
    "1. Один лист — одно предприятие. Чтобы добавить предприятие, скопируйте лист (правый щелчок по ярлыку → Переместить или скопировать → Создать копию).",
    "2. Вверху: наименование, ИНН (14 цифр), ведомство или группа — по ней предприятия группируются в портфеле.",
    "3. Единица: сом или тыс. сом. Доходы и расходы: за квартал или нарастающим итогом с начала года — программа пересчитает в квартальные.",
    "4. В строке «Код» — даты окончания периодов (30.06.2026, 30.09.2026 …). Можно добавлять столбцы справа и менять даты.",
    "5. Раздел 1 — остатки на конец периода. Раздел 2 — доходы и расходы за период. Убыток и отрицательные суммы — со знаком минус.",
    "6. Раздел 3 — долги, не погашенные в установленный срок (по договору, Налоговому кодексу, срокам выплаты зарплаты).",
    "7. Серые строки (Б6, Б8, Б15, Д4) считаются формулой: если Б15 не совпадает с вашим капиталом по балансу, проверьте строки.",
    "8. Код в первой колонке не меняйте: по нему программа находит строку. Пустая ячейка — значит нет данных.",
    "",
    "Загрузка: FinLite → «Отчётность предприятий» → выберите один или несколько файлов. Перед загрузкой программа покажет найденные предприятия, периоды и расхождения.",
  ].forEach((t, i) => { const c = ws.getCell(`A${i + 1}`); c.value = t; c.alignment = { wrapText: true }; if (i === 0) c.font = { bold: true, size: 13 }; });
}

/** Пустой шаблон на последние 4 квартала или пример с данными предприятий. */
export async function buildTemplate(opts: { companies?: ReportedCompany[]; today: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinLite KG";
  if (opts.companies?.length) {
    for (const c of opts.companies) addSheet(wb, c.name.replace(/^ГП\s*/, "").replace(/[«»"]/g, ""), c, c.periods.map((p) => p.date));
  } else addSheet(wb, "Предприятие", null, lastQuarters(opts.today, 4));
  addGuide(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
