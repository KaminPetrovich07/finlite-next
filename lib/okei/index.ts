/**
 * Классификатор единиц измерения ОКЕИ (ОК 015-94): справочник, поиск и
 * сопоставление того, что пользователь ввёл в поле «Ед. изм.», с кодом ОКЕИ.
 * Код по ОКЕИ нужен в накладных, требованиях-накладных, актах и инвентаризационных
 * описях; в базе по-прежнему хранится условное обозначение (кг, шт, м2 …).
 */
import { OKEI_RAW } from "./data";

export type OkeiSectionId = "intl" | "nat" | "nat4" | "intlx";

export interface OkeiSection { id: OkeiSectionId; title: string }

export interface OkeiUnit {
  /** код: 3 знака (055) или 4 знака (2553) */
  code: string;
  /** основное наименование и синонимы («Литр», «Кубический дециметр») */
  names: string[];
  /** условные обозначения: национальные / международные */
  nat: string[];
  intl: string[];
  /** кодовые буквенные обозначения: национальные / международные */
  natLetter: string[];
  intlLetter: string[];
  section: OkeiSectionId;
  /** группа внутри раздела: «Единицы массы», «Экономические единицы» … */
  group: string;
}

const split = (s: string | undefined) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);

function parse(raw: string): { sections: OkeiSection[]; units: OkeiUnit[] } {
  const sections: OkeiSection[] = [];
  const units: OkeiUnit[] = [];
  let section: OkeiSectionId = "intl";
  let group = "";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("## ")) {
      const [id, title] = t.slice(3).split("|");
      section = id as OkeiSectionId;
      sections.push({ id: section, title });
      continue;
    }
    if (t.startsWith("# ")) { group = t.slice(2); continue; }
    const [code, names, nat, intl, natLetter, intlLetter] = t.split("|");
    units.push({ code, names: split(names), nat: split(nat), intl: split(intl), natLetter: split(natLetter), intlLetter: split(intlLetter), section, group });
  }
  return { sections, units };
}

const parsed = parse(OKEI_RAW);
export const OKEI_SECTIONS: OkeiSection[] = parsed.sections;
export const OKEI: OkeiUnit[] = parsed.units;

const BY_CODE = new Map(OKEI.map((u) => [u.code, u]));
export const okeiByCode = (code: string): OkeiUnit | undefined => BY_CODE.get(code.trim());

/** Наименование единицы для отображения. */
export const unitName = (u: OkeiUnit) => u.names[0];
/** Обозначение, которое пишется в поле «Ед. изм.»: национальное, если есть. */
export const unitSymbol = (u: OkeiUnit) => u.nat[0] ?? u.intl[0] ?? u.names[0];

/** Частые единицы — сверху подсказок. */
export const POPULAR_CODES = [
  "796", "166", "168", "163", "006", "018", "055", "113", "112", "111", "625", "839", "778", "715", "736", "812",
  "8751", "868", "704", "657", "642", "876", "356", "359", "362", "366", "245", "744", "059", "008",
];

/** Привычные написания, которых нет в графах классификатора. */
const ALIASES: Record<string, string> = {
  "шт.": "796", "штук": "796", "штука": "796", "штуки": "796", "pcs": "796", "ед.": "642", "единица": "642",
  "кг.": "166", "килограмм": "166", "гр": "163", "гр.": "163", "г.": "163", "тн": "168", "тонна": "168", "т.": "168",
  "м.": "006", "метр": "006", "пм": "018", "п.м": "018", "п.м.": "018", "пог.м": "018", "пог.м.": "018", "м.п.": "018", "мп": "018",
  "кв.м": "055", "кв.м.": "055", "м²": "055", "м^2": "055", "куб.м": "113", "куб.м.": "113", "м³": "113", "м^3": "113",
  "литр": "112", "л.": "112", "лит": "112", "мл.": "111",
  "лист": "625", "листов": "625", "компл.": "839", "комплект": "839", "к-т": "839", "упак.": "778", "уп": "778", "уп.": "778", "упаковка": "778",
  "пара": "715", "пар.": "715", "рул.": "736", "рулон": "736", "ящ.": "812", "кор.": "8751", "коробка": "8751", "бут.": "868", "флак.": "872",
  "набор": "704", "изд.": "657", "час": "356", "ч.": "356", "чел.-ч": "539", "чел.ч": "539", "мин.": "355", "сут.": "359", "дн.": "359", "день": "359",
  "мес.": "362", "месяц": "362", "год": "366", "квт*ч": "245", "квт/ч": "245", "квтч": "245", "квт·ч": "245", "гкал": "233",
  "усл. ед.": "876", "усл.ед": "876", "усл.ед.": "876", "у.е.": "876", "усл.": "876", "%": "744",
};

const sup = (s: string) => s.replace(/²/g, "2").replace(/³/g, "3").replace(/\^/g, "");
/** Нормализация для мягкого сравнения: регистр, ё, пробелы, «^», надстрочные 2/3. */
const loose = (s: string) => sup(s.toLowerCase().replace(/ё/g, "е")).replace(/\s+/g, "");
/** Ещё мягче: без точек на конце (шт. = шт), но «л.» (лист) ≠ «л» (литр) — сравнивается выше. */
const looser = (s: string) => loose(s).replace(/\.+$/, "");

const symbolsOf = (u: OkeiUnit) => [...u.nat, ...u.intl];

/**
 * Находит единицу ОКЕИ по тому, что написано в поле «Ед. изм.».
 * Порядок: точное обозначение (с учётом регистра: Мм ≠ мм, Мл ≠ мл) → привычные
 * сокращения → код (166) → обозначение без учёта регистра → буквенный код (КГ, KGM) → наименование.
 */
export function findUnit(text: string | null | undefined): OkeiUnit | undefined {
  const raw = (text ?? "").trim();
  if (!raw) return undefined;
  const exact = OKEI.find((u) => symbolsOf(u).includes(raw));
  if (exact) return exact;
  const supRaw = sup(raw);
  const exactSup = OKEI.find((u) => symbolsOf(u).some((s) => sup(s) === supRaw));
  if (exactSup) return exactSup;
  const alias = ALIASES[raw.toLowerCase().replace(/ё/g, "е")] ?? ALIASES[raw.toLowerCase().replace(/\s+/g, "")];
  if (alias) return BY_CODE.get(alias);
  if (/^\d{3,4}$/.test(raw)) return BY_CODE.get(raw);
  const l = loose(raw);
  const ci = OKEI.find((u) => symbolsOf(u).some((s) => loose(s) === l));
  if (ci) return ci;
  const lr = looser(raw);
  const ci2 = OKEI.find((u) => symbolsOf(u).some((s) => looser(s) === lr));
  if (ci2) return ci2;
  const up = raw.toUpperCase().replace(/Ё/g, "Е");
  const letter = OKEI.find((u) => u.natLetter.includes(up) || u.intlLetter.includes(up));
  if (letter) return letter;
  return OKEI.find((u) => u.names.some((n) => loose(n) === l));
}

/** Код ОКЕИ для отображения в документах; null — единица не из классификатора. */
export const okeiCode = (text: string | null | undefined): string | null => findUnit(text)?.code ?? null;

/** Приводит введённую единицу к обозначению по ОКЕИ (шт. → шт, м² → м2); неизвестное оставляет как есть. */
export function normalizeUnit(text: string | null | undefined): string {
  const raw = (text ?? "").trim();
  const u = findUnit(raw);
  return u ? unitSymbol(u) : raw;
}

/** «кг (166)» — для граф «Единица измерения: наименование, код по ОКЕИ». */
export function unitWithCode(text: string | null | undefined): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";
  const u = findUnit(raw);
  return u ? `${raw} (${u.code})` : raw;
}

/**
 * Поиск по классификатору, как в 1С: по коду, обозначению, наименованию, буквенным кодам.
 * Сначала точные совпадения кода и обозначения, затем начало слова, затем вхождение.
 */
export function searchOkei(query: string, opts: { section?: OkeiSectionId; limit?: number } = {}): OkeiUnit[] {
  const q = loose(query);
  const pool = opts.section ? OKEI.filter((u) => u.section === opts.section) : OKEI;
  if (!q) return opts.limit ? pool.slice(0, opts.limit) : pool;
  const scored: Array<{ u: OkeiUnit; s: number; i: number }> = [];
  pool.forEach((u, i) => {
    const syms = symbolsOf(u).map(loose);
    const letters = [...u.natLetter, ...u.intlLetter].map(loose);
    const names = u.names.map((n) => n.toLowerCase().replace(/ё/g, "е"));
    let s = 0;
    if (u.code === query.trim()) s = 100;
    else if (syms.includes(q)) s = 90;
    else if (letters.includes(q)) s = 80;
    else if (u.code.startsWith(query.trim())) s = 70;
    else if (names.some((n) => n.startsWith(query.trim().toLowerCase()))) s = 60;
    else if (names.some((n) => n.split(/[\s(\-]+/).some((w) => w.startsWith(query.trim().toLowerCase())))) s = 50;
    else if (syms.some((x) => x.startsWith(q))) s = 40;
    else if (names.some((n) => loose(n).includes(q))) s = 30;
    else if (letters.some((x) => x.includes(q))) s = 20;
    if (s) scored.push({ u, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const out = scored.map((x) => x.u);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** Подсказки для поля «Ед. изм.»: сначала частые, затем весь классификатор; обозначения без повторов. */
export function unitSuggestions(): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ value: string; label: string }> = [];
  const add = (u: OkeiUnit) => {
    const v = unitSymbol(u);
    if (seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, label: `${u.code} · ${unitName(u)}` });
  };
  POPULAR_CODES.forEach((c) => { const u = BY_CODE.get(c); if (u) add(u); });
  OKEI.filter((u) => u.section !== "intlx").forEach(add);
  return out;
}
