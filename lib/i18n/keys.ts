// Все строки интерфейса, которые уже переведены (переводятся) на кыргызский: из кода страниц
// (вызовы t("…") и <T>…</T>) и из общих списков (меню, виды номенклатуры, источники проводок…).
// Используется тестом полноты перевода и для выгрузки словаря на проверку носителю языка.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_ACTIONS, NAV_GROUPS, HOME_LINK } from "@/lib/nav";
import { KIND_LABEL, VAT_LABEL } from "@/lib/trade/catalog";
import { DOC_LABEL, PAYMENT_LABEL } from "@/lib/trade/doc";
import { SOURCE_LABEL } from "@/lib/ledger/types";
import { SOURCE_NOTE } from "@/lib/ledger/source-note";
import { PLANS } from "@/lib/plans";

/** Files whose t("…") literals are checked. */
export const TRANSLATED_FILES = [
  "components/Nav.tsx", "components/MobileTabs.tsx", "components/Footer.tsx", "components/CommandPalette.tsx", "components/auth/UserMenu.tsx",
  "components/i18n.tsx", "components/ledger/EntryCard.tsx", "components/ledger/PeriodPicker.tsx",
  "app/page.tsx", "app/login/page.tsx", "app/register/page.tsx", "app/reset/page.tsx",
  "app/ledger/page.tsx", "app/trade/page.tsx", "app/nomenclature/page.tsx",
];

/** Lists of labels that are passed to t() as variables. */
export function listKeys(): string[] {
  const out: string[] = [];
  for (const g of NAV_GROUPS) { out.push(g.title); for (const l of g.links) out.push(l.label, l.desc); }
  for (const l of [...NAV_ACTIONS, HOME_LINK]) out.push(l.label, l.desc);
  out.push(...Object.values(KIND_LABEL), ...Object.values(VAT_LABEL), ...Object.values(DOC_LABEL));
  for (const m of Object.values(PAYMENT_LABEL)) out.push(...Object.values(m));
  out.push(...Object.values(SOURCE_LABEL), ...Object.values(SOURCE_NOTE));
  out.push(...Object.values(PLANS).map((p) => p.name));
  out.push("Недавние", "Действия", "Найдено", "Месяц", "Квартал", "Год", "Свой период");
  return out;
}

/** Literal keys from the source files: t("…"), t('…'), <T>…</T>, <T vars…>{"…"}</T>. */
export function codeKeys(root = process.cwd()): string[] {
  const out: string[] = [];
  for (const f of TRANSLATED_FILES) {
    const src = readFileSync(join(root, f), "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) out.push(JSON.parse(`"${m[1]}"`));
    for (const m of src.matchAll(/<T(?:\s[^>]*)?>([^<{}"]+)<\/T>/g)) out.push(m[1].trim());
    for (const m of src.matchAll(/<T[^>]*>\{"((?:[^"\\]|\\.)*)"\}<\/T>/g)) out.push(JSON.parse(`"${m[1]}"`));
  }
  // рабочий стол: подписи плиток, шагов и источников проводок переводятся при выводе
  const home = readFileSync(join(root, "app/page.tsx"), "utf8");
  for (const m of home.matchAll(/\b(?:label|text|title|cta): "([^"]+)"/g)) out.push(m[1]);
  const src = home.match(/const SOURCE[^{]*\{([^}]*)\}/)?.[1] ?? "";
  for (const m of src.matchAll(/: "([^"]+)"/g)) out.push(m[1]);
  return out;
}

export const allKeys = (root?: string) => [...new Set([...listKeys(), ...codeKeys(root)])].filter((k) => /[А-Яа-яЁё]/.test(k));
