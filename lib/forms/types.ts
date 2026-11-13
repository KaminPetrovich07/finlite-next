// ════════════════════════════════════════════════════════════════════════
// lib/forms/types.ts — бланки первичной учётной документации.
//
// Источник: «Альбом унифицированных форм первичной учётной документации»
// (Кыргызская Республика). Каждая форма описана данными: шапка, поля,
// таблицы с многоуровневыми графами и номерами граф, подписи, оборотная
// сторона — в том порядке и с теми же названиями, что в альбоме. Из этих
// данных строятся документы Word и PDF и форма для заполнения в браузере.
// ════════════════════════════════════════════════════════════════════════

import type { Align } from "@/lib/docs/model";

/** Разделы альбома — в его порядке. */
export type FormSection = "cash" | "fa" | "inv" | "hr" | "stock" | "storage" | "bio" | "build" | "other" | "contract" | "ip";

/** Что программа подставляет сама. */
export type Fill =
  | "org" | "inn" | "okpo" | "address" | "dept"
  | "director" | "directorTitle" | "chief" | "cashier" | "storekeeper"
  | "today" | "year";

export type FillValues = Partial<Record<Fill, string>>;

/** Поле бланка: «Подпись: значение». */
export interface FieldDef { label: string; fill?: Fill; hint?: string }

/** Графа таблицы. `h` — путь шапки через «|»: «Дебет|счёт» объединяется с «Дебет|код». */
export interface ColDef { h: string; w?: number; a?: Align; sum?: boolean }

export type Part =
  | { t: "approve"; who?: string }
  | { t: "title"; text: string; no?: boolean; date?: boolean; sub?: string }
  | { t: "fields"; items: FieldDef[] }
  | { t: "text"; text: string; bold?: boolean; center?: boolean }
  | { t: "h"; text: string }
  | {
      t: "table"; id: string; title?: string; cols: ColDef[];
      /** номера граф: true — с 1, число — с этого номера, массив — свои подписи (как в альбоме) */
      nums?: boolean | number | string[];
      /** сколько пустых строк печатать на чистом бланке */
      rows?: number;
      /** итоговые строки: подпись в первой графе, суммы по графам с sum */
      totals?: string[];
      /** готовые строки (например, «Остаток на начало дня») */
      fixed?: string[][];
    }
  | { t: "sign"; items: Array<{ role: string; fill?: Fill }> }
  | { t: "note"; text: string }
  /** оборотная сторона / следующая страница бланка */
  | { t: "back"; text?: string };

export interface FormDef {
  /** латиницей для адресов: "os-1", "nf-nma-act" */
  id: string;
  /** номер по содержанию альбома */
  n: string;
  /** код формы: «ОС-1»; для неунифицированных — пусто */
  code: string;
  title: string;
  section: FormSection;
  unified: boolean;
  landscape?: boolean;
  /** короткое назначение — из указаний по применению */
  use: string;
  /** не печатать стандартную шапку с организацией (у договоров, обложек) */
  noOrg?: boolean;
  /** строка «Форма утверждена …» вместо «Форма № …» */
  approvedBy?: string;
  /** эта форма уже заполняется из журнала на другой странице */
  journal?: { href: string; label: string };
  parts: Part[];
}

/** Что пользователь ввёл в бланк. Ключ поля — «индекс части.индекс поля». */
export interface FormValues {
  f?: Record<string, string>;
  t?: Record<string, string[][]>;
}

export const SECTIONS: Array<{ key: FormSection; title: string }> = [
  { key: "cash", title: "Касса и подотчётные суммы" },
  { key: "fa", title: "Основные средства и НМА" },
  { key: "inv", title: "Инвентаризация" },
  { key: "hr", title: "Труд и его оплата" },
  { key: "stock", title: "Материалы, МБП, спецодежда" },
  { key: "storage", title: "Продукция и ТМЦ в местах хранения" },
  { key: "bio", title: "Запасы и биологические активы" },
  { key: "build", title: "Строительство" },
  { key: "other", title: "Прочие первичные документы" },
  { key: "contract", title: "Договоры о материальной ответственности" },
  { key: "ip", title: "Регистры индивидуальных предпринимателей" },
];
