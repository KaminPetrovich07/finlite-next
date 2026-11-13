// Разбор кассового чека: текст после распознавания (OCR) и ссылка из QR-кода.
// Находим дату, итог, продавца, ИНН и НДС, подсказываем счёт расходов по словам в чеке.
// Распознавание неточное — всё, что найдено, показывается пользователю для проверки перед проводкой.

export interface ReceiptData {
  date: string | null;     // YYYY-MM-DD
  total: number | null;
  vat: number | null;
  seller: string | null;
  inn: string | null;
  checkUrl: string | null; // ссылка проверки чека в системе ГНС (из QR)
  account: string;         // предлагаемый счёт расходов
  hint: string;            // почему предложен этот счёт
}

const num = (s: string) => Number(s.replace(/[\s ]/g, "").replace(",", "."));
// OCR путает буквы и цифры в числах: О→0, З→3, l→1
const fixDigits = (s: string) => s.replace(/(?<=[\d\s.,])[OoОо©®](?=[\d\s.,])/g, "0").replace(/(?<=\d)[lI|](?=\d)/g, "1");

/** Деньги: «1 250,00», «1250.00», «1250-00». */
const MONEY = /(\d{1,3}(?:[\s ]\d{3})+|\d+)[.,-](\d{2})(?!\d)/g;

export function findDate(text: string, today = new Date()): string | null {
  const m = text.match(/(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4}|\d{2})(?!\d)/) ?? null;
  const iso = text.match(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  let y: number, mo: number, d: number;
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (m) { d = Number(m[1]); mo = Number(m[2]); y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]); }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > today.getUTCFullYear() + 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function findTotal(text: string): number | null {
  const lines = fixDigits(text).split(/\r?\n/);
  const pick = (re: RegExp) => {
    let best: number | null = null;
    for (const l of lines) if (re.test(l)) for (const m of l.matchAll(MONEY)) { const v = num(`${m[1]}.${m[2]}`); if (v > 0) best = v; }
    return best;
  };
  return pick(/ИТОГО|ИТОГ\b|К ОПЛАТЕ|ВСЕГО К ОПЛАТЕ/i) ?? pick(/ВСЕГО|СУММА|НАЛИЧН|БЕЗНАЛ|КАРТ/i)
    ?? (() => { let max: number | null = null; for (const m of fixDigits(text).matchAll(MONEY)) { const v = num(`${m[1]}.${m[2]}`); if (v > 0 && (max === null || v > max)) max = v; } return max; })();
}

export function findVat(text: string): number | null {
  for (const l of fixDigits(text).split(/\r?\n/)) if (/НДС|ҚҚС|КНС/i.test(l) && !/без\s*НДС/i.test(l)) {
    const ms = [...l.matchAll(MONEY)];
    if (ms.length) return num(`${ms[ms.length - 1][1]}.${ms[ms.length - 1][2]}`);
  }
  return null;
}

export function findInn(text: string): string | null {
  const m = fixDigits(text).match(/(?:ИНН|INN|СТН)\s*[:№]?\s*(\d[\d\s]{11,16}\d)/i);
  const d = m?.[1].replace(/\s/g, "");
  return d && (d.length === 14 || d.length === 12) ? d : null;
}

/** OCR часто читает О как ноль в названиях форм собственности: «0с00» → «ОсОО». */
const fixForm = (s: string) => s
  .replace(/(^|[\s«"])[0OО][cс][0OО][0OО](?=[\s«"])/g, "$1ОсОО")
  .replace(/(^|[\s«"])[0OО][AА][0OО](?=[\s«"])/g, "$1ОАО")
  .replace(/(^|[\s«"])[3З][AА][0OО](?=[\s«"])/g, "$1ЗАО")
  .replace(/(^|[\s«"])[0OО][0OО][0OО](?=[\s«"])/g, "$1ООО");

export function findSeller(text: string): string | null {
  text = fixForm(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const org = lines.find((l) => /\b(ОсОО|ОАО|ЗАО|ООО|ОО|ИП|ЧП|ОсОО|LLC)\b|«.+»|".+"/i.test(l) && !/кассир|ИНН|чек|смена/i.test(l));
  if (org) return org.replace(/\s{2,}/g, " ").slice(0, 120);
  const named = lines.find((l) => /магазин|аптека|азс|кафе|ресторан|маркет|market|store/i.test(l));
  return named ? named.slice(0, 120) : null;
}

const RULES: Array<[RegExp, string, string]> = [
  [/АИ-?\s?9[2-8]|дизел|бензин|топлив|\bАЗС\b|газ\s*(пропан|метан)|Газпром|Shell|Petrol/i, "7540", "топливо — транспортные расходы"],
  [/бумага|ручк|канцел|степлер|папк|картридж|скрепк/i, "8060", "канцелярия"],
  [/кафе|ресторан|кофе|обед|ужин|банкет|chaihana|чайхан/i, "8130", "питание — представительские расходы"],
  [/такси|Yandex Go|Яндекс Go|inDrive|проезд|билет/i, "8200", "проезд — местная командировка"],
  [/интернет|связь|мобильн|O!|Мегаком|Beeline|Билайн|Saima|сотов/i, "8070", "связь"],
  [/ремонт|запчаст|сервис|шиномонтаж|СТО/i, "8110", "ремонт и обслуживание"],
  [/вода|мыло|моющ|салфет|хозтовар|туалетн/i, "8490", "хозяйственные расходы"],
  [/ЛДСП|фанер|ДВП|ДСП|краск|клей|саморез|фурнитур|петл|направляющ/i, "1620", "материалы для производства"],
];

export function suggestAccount(text: string): { account: string; hint: string } {
  for (const [re, account, hint] of RULES) if (re.test(text)) return { account, hint };
  return { account: "8490", hint: "прочие расходы — уточните счёт" };
}

/** Ссылка из QR-кода: дата, сумма и ИНН из параметров, если есть; ссылка проверки — только на сайты ГНС. */
export function parseQr(raw: string): Partial<ReceiptData> {
  const out: Partial<ReceiptData> = {};
  let url: URL | null = null;
  try { url = new URL(raw.trim()); } catch { /* не ссылка */ }
  const params = new Map<string, string>();
  if (url) url.searchParams.forEach((v, k) => params.set(k.toLowerCase(), v));
  else for (const part of raw.split(/[&;\n]/)) { const [k, v] = part.split("="); if (k && v) params.set(k.trim().toLowerCase(), v.trim()); }
  const get = (...keys: string[]) => keys.map((k) => params.get(k)).find(Boolean);
  const sum = get("sum", "s", "amount", "total", "summa");
  if (sum && /^\d+([.,]\d{1,2})?$/.test(sum)) out.total = num(sum);
  const dt = get("date", "dt", "t", "datetime");
  if (dt) { const m = dt.match(/^(20\d{2})-?(\d{2})-?(\d{2})/); if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`; }
  const inn = get("tin", "inn", "tpin");
  if (inn && /^\d{12,14}$/.test(inn)) out.inn = inn;
  if (url && /(^|\.)salyk\.kg$|(^|\.)kkm\.gov\.kg$|(^|\.)sti\.gov\.kg$/i.test(url.hostname)) out.checkUrl = url.toString();
  return out;
}

export function parseReceipt(text: string, qr?: string | null, today = new Date()): ReceiptData {
  const q = qr ? parseQr(qr) : {};
  const s = suggestAccount(text);
  return {
    date: q.date ?? findDate(text, today),
    total: q.total ?? findTotal(text),
    vat: findVat(text),
    seller: findSeller(text),
    inn: q.inn ?? findInn(text),
    checkUrl: q.checkUrl ?? null,
    ...s,
  };
}
