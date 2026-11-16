// ════════════════════════════════════════════════════════════════════════
// lib/sheet-client.ts — чтение Excel (.xlsx/.xls) в браузере.
// Файл разбирается на компьютере пользователя, на сервер уходят только
// строки (JSON). Сервер не запускает разбор бинарных таблиц, поэтому
// специально испорченный файл не может навредить серверу.
// Только для клиентских компонентов.
// ════════════════════════════════════════════════════════════════════════

export const isSheetFile = (name: string) => /\.(xlsx|xls)$/i.test(name);

/** Первый лист как массив объектов «заголовок → значение»; даты — серийные числа Excel. */
export async function readSheetRows(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
}
