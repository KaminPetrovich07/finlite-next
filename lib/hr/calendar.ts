// Производственный календарь: рабочие дни месяца при пятидневке за вычетом праздников.
// Праздники меняются решениями Кабинета министров (переносы, Орозо айт и Курман айт по лунному
// календарю), поэтому список — настройка компании; ниже — значения по умолчанию.

/**
 * 2026 год. Источник: календарь, утверждённый Минтрудом (kaktus.media, 2026) по новому Трудовому кодексу
 * (перенос выходных на понедельник отменён): 1–6 января и продление до 12 января решением Кабмина,
 * 7 января, 8 марта, 21 марта, 1–10 мая (майские выходные), 31 августа; Орозо айт и Курман айт —
 * по ожидаемым датам. Проверьте по актуальному производственному календарю.
 */
export const DEFAULT_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-12",
    "2026-03-20", "2026-05-01", "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08",
    "2026-05-27", "2026-08-31",
  ],
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Рабочие дни месяца YYYY-MM. */
export function workingDays(month: string, holidays: string[]): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const hs = new Set(holidays);
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d = new Date(d.getTime() + 864e5)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !hs.has(iso(d))) out.push(iso(d));
  }
  return out;
}

export const prevMonth = (month: string, n = 1) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
};
export const lastDay = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
