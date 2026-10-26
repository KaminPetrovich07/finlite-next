// ════════════════════════════════════════════════════════════════════════
// lib/ledger/accounts.ts — план счетов FinLite KG
//
// Balance-sheet accounts follow the 4-digit numbering already printed on the
// ФОСАМК Ф.№1 rows in lib/balance-sheet.ts (1100 касса, 1200 банк, 3400
// налоги к оплате …), so every account lands on exactly one balance row.
//
// P&L accounts (6xxx доходы / 7xxx расходы) carry a `pl` role instead of a
// balance row. The engine never looks at the digits — only at `type`,
// `bsRow` and `pl` — so if a sub-account number needs to change to match the
// current редакция плана счетов КР, it is a one-line edit here.
// ════════════════════════════════════════════════════════════════════════

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** How a P&L account feeds the income statement (mirrors CalculateInput in lib/tax-engine.ts). */
export type PlRole =
  | "revenue"        // выручка от реализации
  | "otherIncome"    // прочие операционные доходы
  | "investInc"      // доходы от инвестиций
  | "otherNonOpInc"  // прочие внереализационные доходы
  | "cogs"           // себестоимость
  | "selling"        // коммерческие расходы
  | "admin"          // административные расходы
  | "salaries"       // оплата труда
  | "social"         // страховые взносы работодателя
  | "rent"           // аренда
  | "utilities"      // коммунальные (отдельно — для ESG: энергия)
  | "otherTaxes"     // налоги в составе расходов (налог с продаж и т.п.)
  | "otherOp"        // прочие операционные расходы
  | "interest"       // расходы по процентам
  | "otherNonOpExp"  // прочие внереализационные расходы
  | "incomeTax";     // налог на прибыль / единый налог / патент

/** Role in the direct-method cash flow (ОДДС) when the account is the counterpart of a cash line. */
export type CfRole =
  | "cash"           // the cash accounts themselves
  | "sales"          // 010 / —
  | "supplies"       // 050 закупка запасов
  | "services"       // 060 операционные расходы (услуги)
  | "interest"       // 070
  | "otherOperating" // 080 прочие операционные выплаты (зарплата, налоги кроме НП)
  | "incomeTax"      // 090
  | "fixedAssets"    // 210 / 280
  | "securities"     // 220 / 300
  | "intangibles"    // 230 / 290
  | "investIncome"   // 240
  | "loansGiven"     // 250 / 310
  | "ownerCapital"   // 430 / —
  | "borrowings"     // 440 / 480
  | "dividends"      // — / 470
  | "otherInvesting";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  /** Contra-account (e.g. accumulated depreciation): sits in its parent's section with the opposite sign. */
  contra?: boolean;
  /** ФОСАМК Ф.№1 parent row (the one BALANCE_TOTALS sums) */
  bsRow?: number;
  /** ФОСАМК Ф.№1 detail row, if the form has one */
  bsSub?: number;
  pl?: PlRole;
  cf?: CfRole;
}

export const ACCOUNTS: Account[] = [
  // ── 1. Оборотные активы ──────────────────────────────────────────────
  { code: "1110", name: "Касса (сом)", type: "asset", bsRow: 110, cf: "cash" },
  { code: "1210", name: "Расчётный счёт в банке (сом)", type: "asset", bsRow: 120, cf: "cash" },
  { code: "1220", name: "Валютный счёт в банке", type: "asset", bsRow: 120, cf: "cash" },
  { code: "1310", name: "Краткосрочные долговые ценные бумаги", type: "asset", bsRow: 130, bsSub: 131, cf: "securities" },
  { code: "1330", name: "Краткосрочные депозиты и займы выданные", type: "asset", bsRow: 130, bsSub: 133, cf: "loansGiven" },
  { code: "1410", name: "Счета к получению за товары, услуги", type: "asset", bsRow: 140, bsSub: 141, cf: "sales" },
  { code: "1491", name: "Резерв на безнадёжные долги", type: "asset", contra: true, bsRow: 140, bsSub: 142 },
  { code: "1520", name: "Дебиторская задолженность сотрудников", type: "asset", bsRow: 150, bsSub: 152, cf: "otherOperating" },
  { code: "1540", name: "НДС к зачёту", type: "asset", bsRow: 150, bsSub: 153, cf: "otherOperating" },
  { code: "1590", name: "Прочая дебиторская задолженность", type: "asset", bsRow: 150, bsSub: 157, cf: "otherOperating" },
  { code: "1595", name: "Невыясненные платежи", type: "asset", bsRow: 150, bsSub: 157, cf: "otherOperating" },
  { code: "1610", name: "Товары", type: "asset", bsRow: 160, bsSub: 161, cf: "supplies" },
  { code: "1620", name: "Сырьё и материалы", type: "asset", bsRow: 160, bsSub: 162, cf: "supplies" },
  { code: "1630", name: "Незавершённое производство", type: "asset", bsRow: 160, bsSub: 163, cf: "supplies" },
  { code: "1640", name: "Готовая продукция", type: "asset", bsRow: 160, bsSub: 164, cf: "supplies" },
  { code: "1810", name: "Авансы выданные поставщикам", type: "asset", bsRow: 180, bsSub: 181, cf: "supplies" },
  { code: "1830", name: "Аренда, оплаченная авансом", type: "asset", bsRow: 180, bsSub: 183, cf: "services" },
  { code: "1910", name: "Задолженность учредителей по взносам в УК", type: "asset", bsRow: 190, cf: "ownerCapital" },

  // ── 2. Внеоборотные активы ───────────────────────────────────────────
  { code: "2110", name: "Земля", type: "asset", bsRow: 210, bsSub: 211, cf: "fixedAssets" },
  { code: "2120", name: "Незавершённое строительство", type: "asset", bsRow: 210, bsSub: 212, cf: "fixedAssets" },
  { code: "2130", name: "Здания и сооружения", type: "asset", bsRow: 210, bsSub: 213, cf: "fixedAssets" },
  { code: "2140", name: "Машины и оборудование", type: "asset", bsRow: 210, bsSub: 214, cf: "fixedAssets" },
  { code: "2150", name: "Конторское оборудование", type: "asset", bsRow: 210, bsSub: 215, cf: "fixedAssets" },
  { code: "2170", name: "Транспортные средства", type: "asset", bsRow: 210, bsSub: 217, cf: "fixedAssets" },
  { code: "2193", name: "Амортизация зданий и сооружений", type: "asset", contra: true, bsRow: 210, bsSub: 213 },
  { code: "2194", name: "Амортизация оборудования", type: "asset", contra: true, bsRow: 210, bsSub: 214 },
  { code: "2197", name: "Амортизация транспортных средств", type: "asset", contra: true, bsRow: 210, bsSub: 217 },
  { code: "2810", name: "Долгосрочные инвестиции", type: "asset", bsRow: 280, bsSub: 286, cf: "securities" },
  { code: "2910", name: "Нематериальные активы", type: "asset", bsRow: 290, cf: "intangibles" },
  { code: "2990", name: "Амортизация нематериальных активов", type: "asset", contra: true, bsRow: 290 },

  // ── 3. Краткосрочные обязательства ───────────────────────────────────
  { code: "3110", name: "Счета к оплате поставщикам", type: "liability", bsRow: 310, cf: "supplies" },
  { code: "3210", name: "Авансы полученные от покупателей", type: "liability", bsRow: 320, cf: "sales" },
  { code: "3310", name: "Краткосрочные кредиты и займы", type: "liability", bsRow: 330, cf: "borrowings" },
  { code: "3410", name: "Налог на прибыль / единый налог к оплате", type: "liability", bsRow: 340, bsSub: 341, cf: "incomeTax" },
  { code: "3420", name: "Подоходный налог к оплате", type: "liability", bsRow: 340, bsSub: 342, cf: "otherOperating" },
  { code: "3430", name: "НДС к оплате", type: "liability", bsRow: 340, bsSub: 343, cf: "otherOperating" },
  { code: "3490", name: "Прочие налоги к оплате", type: "liability", bsRow: 340, bsSub: 345, cf: "otherOperating" },
  { code: "3520", name: "Начисленная заработная плата", type: "liability", bsRow: 350, bsSub: 352, cf: "otherOperating" },
  { code: "3530", name: "Страховые взносы к оплате", type: "liability", bsRow: 350, bsSub: 353, cf: "otherOperating" },
  { code: "3540", name: "Дивиденды к выплате", type: "liability", bsRow: 350, bsSub: 354, cf: "dividends" },
  { code: "3550", name: "Начисленные проценты", type: "liability", bsRow: 350, bsSub: 355, cf: "interest" },
  { code: "3610", name: "Прочие краткосрочные обязательства", type: "liability", bsRow: 360, cf: "otherOperating" },
  { code: "3615", name: "Невыясненные поступления", type: "liability", bsRow: 360, cf: "otherOperating" },

  // ── 4. Долгосрочные обязательства ────────────────────────────────────
  { code: "4120", name: "Долгосрочные банковские кредиты", type: "liability", bsRow: 410, bsSub: 412, cf: "borrowings" },
  { code: "4130", name: "Прочие долгосрочные займы", type: "liability", bsRow: 410, bsSub: 413, cf: "borrowings" },
  { code: "4150", name: "Финансовая аренда", type: "liability", bsRow: 410, bsSub: 415, cf: "borrowings" },
  { code: "4210", name: "Отсроченные доходы", type: "liability", bsRow: 420, cf: "sales" },

  // ── 5. Собственный капитал ───────────────────────────────────────────
  { code: "5130", name: "Уставный капитал", type: "equity", bsRow: 510, bsSub: 513, cf: "ownerCapital" },
  { code: "5210", name: "Дополнительный оплаченный капитал", type: "equity", bsRow: 520, bsSub: 521, cf: "ownerCapital" },
  { code: "5220", name: "Резерв переоценки", type: "equity", bsRow: 520, bsSub: 522 },
  { code: "5310", name: "Нераспределённая прибыль", type: "equity", bsRow: 530, cf: "dividends" },
  { code: "5410", name: "Резервный капитал", type: "equity", bsRow: 540 },

  // ── 6. Доходы ────────────────────────────────────────────────────────
  { code: "6010", name: "Доход от реализации продукции, работ, услуг", type: "income", pl: "revenue", cf: "sales" },
  { code: "6110", name: "Прочие операционные доходы", type: "income", pl: "otherIncome", cf: "otherOperating" },
  { code: "6210", name: "Доходы от инвестиций (проценты, дивиденды)", type: "income", pl: "investInc", cf: "investIncome" },
  { code: "6310", name: "Прочие внереализационные доходы", type: "income", pl: "otherNonOpInc", cf: "otherInvesting" },

  // ── 7. Расходы ───────────────────────────────────────────────────────
  { code: "7010", name: "Себестоимость реализованной продукции", type: "expense", pl: "cogs", cf: "supplies" },
  { code: "7110", name: "Коммерческие расходы (реклама, доставка)", type: "expense", pl: "selling", cf: "services" },
  { code: "7210", name: "Административные расходы", type: "expense", pl: "admin", cf: "services" },
  { code: "7220", name: "Расходы на оплату труда", type: "expense", pl: "salaries", cf: "otherOperating" },
  { code: "7230", name: "Страховые взносы работодателя", type: "expense", pl: "social", cf: "otherOperating" },
  { code: "7240", name: "Аренда", type: "expense", pl: "rent", cf: "services" },
  { code: "7250", name: "Коммунальные услуги и энергия", type: "expense", pl: "utilities", cf: "services" },
  { code: "7260", name: "Амортизация", type: "expense", pl: "admin" },
  { code: "7310", name: "Прочие операционные расходы", type: "expense", pl: "otherOp", cf: "services" },
  { code: "7410", name: "Расходы по процентам", type: "expense", pl: "interest", cf: "interest" },
  { code: "7420", name: "Прочие внереализационные расходы", type: "expense", pl: "otherNonOpExp", cf: "services" },
  { code: "7510", name: "Налоги, относимые на расходы", type: "expense", pl: "otherTaxes", cf: "otherOperating" },
  { code: "7710", name: "Налог на прибыль / единый налог / патент", type: "expense", pl: "incomeTax", cf: "incomeTax" },
];

const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));

export function getAccount(code: string): Account | undefined {
  return BY_CODE.get(code);
}

export function accountName(code: string): string {
  return BY_CODE.get(code)?.name ?? `Счёт ${code}`;
}

export function isCash(code: string): boolean {
  return BY_CODE.get(code)?.cf === "cash";
}

export function isPl(code: string): boolean {
  const t = BY_CODE.get(code)?.type;
  return t === "income" || t === "expense";
}

/** Debit-normal accounts: assets and expenses. Contra-assets are still debit-signed (they just come out negative). */
export function isDebitNormal(code: string): boolean {
  const t = BY_CODE.get(code)?.type;
  return t === "asset" || t === "expense";
}

export const CASH_ACCOUNTS = ACCOUNTS.filter((a) => a.cf === "cash").map((a) => a.code);
export const SUSPENSE_ACCOUNTS = ["1595", "3615"] as const;

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Актив",
  liability: "Обязательство",
  equity: "Капитал",
  income: "Доход",
  expense: "Расход",
};
