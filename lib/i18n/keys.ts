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
import { ALL_CATEGORIES } from "@/lib/categories";
import { REGIME_INFO, REGIMES } from "@/lib/tax-engine";
import { NATURE_LABEL } from "@/lib/ledger/accounts";
import { DIAG_TEXTS } from "@/lib/insolvency/diagnose";
import { RISK_TEXTS } from "@/lib/taxrisk/check";
import { EAEU, IMPORT_TEXTS, ORIGIN_LABEL } from "@/lib/import-goods/calc";
import { SCORE_TEXTS } from "@/lib/portfolio/score";
import { REPORTED_TEXTS } from "@/lib/reported/reported";
import { LAND_TEXTS } from "@/lib/land/land";
import { DEMO_SEGMENT } from "@/lib/reported/demo";

/** Files whose t("…") literals are checked. */
export const TRANSLATED_FILES = [
  "components/Nav.tsx", "components/MobileTabs.tsx", "components/Footer.tsx", "components/CommandPalette.tsx", "components/auth/UserMenu.tsx",
  "components/i18n.tsx", "components/ledger/EntryCard.tsx", "components/ledger/PeriodPicker.tsx",
  "app/page.tsx", "app/login/page.tsx", "app/register/page.tsx", "app/reset/page.tsx",
  "app/ledger/page.tsx", "app/trade/page.tsx", "app/nomenclature/page.tsx",
  "app/diagnostics/page.tsx", "app/taxrisk/page.tsx", "app/import-goods/page.tsx", "app/portfolio/page.tsx", "app/reported/page.tsx", "app/land/page.tsx",
  "app/companies/page.tsx", "app/transactions/page.tsx", "app/inventory/page.tsx",
  "components/ledger/Trash.tsx", "components/ledger/AccountPicker.tsx", "components/AccountView.tsx",
  "components/ledger/statements.tsx", "app/reports/page.tsx", "components/ledger/Dashboard.tsx",
];

/** Строки отчётов: статьи баланса, ОПиУ, ОДДС, отчёта о капитале и названия сверок. */
const STATEMENT_FILES = ["lib/balance-sheet.ts", "lib/cash-flow.ts", "lib/equity.ts", "lib/ledger/engine.ts", "lib/ledger/analytics.ts"];

/** Lists of labels that are passed to t() as variables. */
export function listKeys(): string[] {
  const out: string[] = [];
  for (const g of NAV_GROUPS) { out.push(g.title); for (const l of g.links) out.push(l.label, l.desc, ...(l.section ? [l.section] : [])); }
  for (const l of [...NAV_ACTIONS, HOME_LINK]) out.push(l.label, l.desc);
  out.push(...Object.values(KIND_LABEL), ...Object.values(VAT_LABEL), ...Object.values(DOC_LABEL));
  for (const m of Object.values(PAYMENT_LABEL)) out.push(...Object.values(m));
  out.push(...Object.values(SOURCE_LABEL), ...Object.values(SOURCE_NOTE));
  out.push(...Object.values(PLANS).map((p) => p.name));
  out.push("Недавние", "Действия", "Найдено", "Месяц", "Квартал", "Год", "Свой период");
  out.push(...ALL_CATEGORIES, ...Object.values(REGIME_INFO).map((r) => r.short), ...Object.values(REGIMES), ...Object.values(NATURE_LABEL));
  out.push("МБанк", "Бакай Банк", "Элдик Банк", "Другой банк", "Выписка", "Дт", "Кт");
  out.push("Статьи МСФО", "План счетов", "Названия статей по МСФО, без кодов счетов", "Коды и названия по плану счетов КР (Пост. № 231)");
  // склад: заголовки таблиц
  out.push("сходится", "внимание", "не сходится", "→ Капитал, стр. 080", "→ Баланс, стр. 530", "→ Налоги", "→ ОДДС, стр. 710", "← Налоги", "← ОПиУ, чистая прибыль",
    "= Капитал, стр. 120", "= Баланс, стр. 110 + 120", "= ОПиУ", "= Баланс, стр. 541", "→ ОПиУ", "→ Баланс, стр. 340", "Показать пустые строки",
    "Нажмите на строку, чтобы увидеть проводки за период.",
    "Прибыль текущего периода показана в стр. 530 без закрывающих проводок — счета 6000–9900 закрываются на неё виртуально, пока период не закрыт проводкой через 5999.",
    "Прямой метод: каждая денежная проводка разнесена по корреспондирующему счёту. Перемещения между кассой и банком не считаются потоком.",
    "Уставный капитал — счета 5100; прочий капитал — 5200 и резервный 5400; нераспределённая прибыль — 5300, 5999 и незакрытая прибыль периода.");
  out.push("Доходы", "Расходы", "Прибыль", "Остаток", "в норме", "обратить внимание", "для справки", "Сом, по проводкам периода",
    "Выберите квартал или год, чтобы увидеть динамику", "Касса и банк на конец месяца, сом", "По элементам затрат, сом", "На конец периода");
  out.push("Номенклатура", "Продано", "На остатке", "Цена за ед.", "Средняя цена", "Себестоимость", "Счёт / статья", "Количество", "Сумма");
  // «Удалённые»: причины и пометки сервера
  out.push("нет снимка проводки", "уже восстановлена", "раздел уже сформировал её заново", "восстановлена из удалённых",
    "восстановлена из удалённых как ручная проводка (строки выписки больше нет)", "удалена строка банковской выписки");
  // финансовая диагностика, налоговые риски, ввоз товара: тексты из lib, которые страницы переводят через t()
  out.push(...SCORE_TEXTS, ...REPORTED_TEXTS, ...LAND_TEXTS, DEMO_SEGMENT, "Госпредприятия (демо)", ...DIAG_TEXTS, ...RISK_TEXTS, ...IMPORT_TEXTS, ...Object.values(ORIGIN_LABEL), ...EAEU, "Китай", "НДС при ввозе из ЕАЭС", "Таможенная служба КР", "Перевозчик");
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
  for (const f of STATEMENT_FILES) {
    const code = readFileSync(join(root, f), "utf8");
    for (const m of code.matchAll(/\b(?:label|title): "([^"]+)"/g)) out.push(m[1].replace(/^\s*—\s*/, "").trim());
  }
  const rep = readFileSync(join(root, "app/reports/page.tsx"), "utf8");
  for (const m of rep.matchAll(/\b(?:label|full): "([^"]+)"/g)) out.push(m[1]);
  const src = home.match(/const SOURCE[^{]*\{([^}]*)\}/)?.[1] ?? "";
  for (const m of src.matchAll(/: "([^"]+)"/g)) out.push(m[1]);
  return out;
}

export const allKeys = (root?: string) => [...new Set([...listKeys(), ...codeKeys(root)])].filter((k) => /[А-Яа-яЁё]/.test(k));
