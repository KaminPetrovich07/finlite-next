// Короткая запись бланков: так описания 130 форм читаются как сами бланки.
import type { ColDef, Fill, FieldDef, FormDef, Part } from "./types";

type FieldArg = string | [string, Fill] | FieldDef;
type ColArg = string | ColDef;

export const form = (d: FormDef): FormDef => d;

export const approve = (who?: string): Part => ({ t: "approve", who });
export const title = (text: string, o: { no?: boolean; date?: boolean; sub?: string } = {}): Part => ({ t: "title", text, ...o });
export const fields = (...items: FieldArg[]): Part => ({
  t: "fields",
  items: items.map((i) => (typeof i === "string" ? { label: i } : Array.isArray(i) ? { label: i[0], fill: i[1] } : i)),
});
export const text = (s: string, o: { bold?: boolean; center?: boolean } = {}): Part => ({ t: "text", text: s, ...o });
export const h = (s: string): Part => ({ t: "h", text: s });
export const note = (s: string): Part => ({ t: "note", text: s });
export const back = (s = "Оборотная сторона"): Part => ({ t: "back", text: s });

/** Таблица: графы строками «Группа|Подграфа», «*» в конце — графа с суммой по итогу. */
export function table(id: string, cols: ColArg[], o: { title?: string; nums?: boolean | number | string[]; rows?: number; totals?: string[]; fixed?: string[][] } = {}): Part {
  return {
    t: "table", id, ...o,
    cols: cols.map((c) => {
      if (typeof c !== "string") return c;
      const sum = c.endsWith("*");
      return { h: sum ? c.slice(0, -1) : c, sum: sum || undefined };
    }),
  };
}

/** Подписи: «Главный бухгалтер», ["Руководитель", "director"]. */
export const sign = (...items: Array<string | [string, Fill]>): Part => ({
  t: "sign",
  items: items.map((i) => (typeof i === "string" ? { role: i } : { role: i[0], fill: i[1] })),
});

/** Стандартная комиссия: председатель и члены. */
export const commission = (members = 3): Part => sign("Председатель комиссии", ...Array.from({ length: members }, (_, i) => (i === 0 ? "Члены комиссии" : "")));
