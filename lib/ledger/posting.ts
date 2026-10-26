// ════════════════════════════════════════════════════════════════════════
// lib/ledger/posting.ts — банковская операция (категория) → проводка.
//
// Each category from lib/categories.ts maps to a counter-account; the bank
// side is always 1210. Deliberate simplifications, all visible in the journal
// and fixable by editing the entry:
//   • закупка товара → сразу 7010 (себестоимость), без учёта запасов;
//   • выплата зарплаты → сразу 7220 (без отдельного начисления по 3520);
//   • при общем режиме из поступления выручки выделяется НДС 12% (3430);
//     входящий НДС по закупкам к зачёту НЕ берётся — без ЭСФ поставщика
//     зачёт неправомерен, поэтому консервативно.
//   • «Не определено» уходит на счета невыясненных сумм 1595 / 3615, и
//     сверка не станет зелёной, пока категорию не уточнят.
// ════════════════════════════════════════════════════════════════════════

import type { Category } from "@/lib/categories";
import type { RegimeKey } from "@/lib/tax-engine";
import { VAT_RATE } from "@/lib/tax-engine";
import { round2, type LedgerLine } from "./types";

export const BANK_ACCOUNT = "1210";

const EXPENSE_ACCOUNT: Partial<Record<Category, string>> = {
  "Себестоимость / закупка товара": "7010",
  "Зарплата": "7220",
  "Аренда": "7240",
  "Коммунальные услуги": "7250",
  "Связь и интернет": "7210",
  "Транспорт и логистика": "7110",
  "Реклама и маркетинг": "7110",
  "Банковские комиссии": "7210",
  "Канцелярия и хозрасходы": "7210",
  "Профессиональные услуги (бухгалтер, юрист)": "7210",
  "Прочие операционные расходы": "7310",
};

const INCOME_ACCOUNT: Partial<Record<Category, string>> = {
  "Выручка от продаж": "6010",
  "Прочие операционные доходы": "6110",
  "Доходы от инвестиций": "6210",
  "Возврат от поставщика": "3110",
  "Прочие доходы": "6310",
};

/** Tax payments reduce the matching liability, chosen by the payment purpose text. */
function taxLiabilityAccount(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("ндс") || d.includes("добавленн")) return "3430";
  if (d.includes("соц") || d.includes("страхов")) return "3530";
  if (d.includes("подоход") || d.includes("ндфл")) return "3420";
  if (d.includes("прибыл") || d.includes("единый") || d.includes("патент")) return "3410";
  return "3490";
}

export interface BankTxInput {
  amount: number; // + приход, − расход
  description: string;
  category: string | null;
}

/** Counter-account the transaction will be posted against (before any VAT split). */
export function counterAccountFor(tx: BankTxInput): string {
  const category = (tx.category ?? "Не определено") as Category;
  const inflow = tx.amount > 0;
  const d = tx.description.toLowerCase();

  if (category === "Налоги и сборы") return taxLiabilityAccount(tx.description);
  if (category === "Кредиты и проценты") {
    if (inflow) return "3310";
    return d.includes("процент") ? "7410" : "3310";
  }
  if (inflow) return INCOME_ACCOUNT[category] ?? "3615";
  return EXPENSE_ACCOUNT[category] ?? "1595";
}

export function bankTxToLines(tx: BankTxInput, regime: RegimeKey | null): LedgerLine[] {
  const amount = round2(Math.abs(tx.amount));
  if (amount === 0) return [];
  const counter = counterAccountFor(tx);
  const inflow = tx.amount > 0;

  if (!inflow) {
    return [
      { account: counter, debit: amount, credit: 0 },
      { account: BANK_ACCOUNT, debit: 0, credit: amount },
    ];
  }

  // Output VAT is carved out of sales receipts for VAT payers (общий режим)
  if (regime === "general" && counter === "6010") {
    const vat = round2((amount * VAT_RATE) / (1 + VAT_RATE));
    return [
      { account: BANK_ACCOUNT, debit: amount, credit: 0 },
      { account: "6010", debit: 0, credit: round2(amount - vat) },
      { account: "3430", debit: 0, credit: vat, memo: "НДС 12% в составе выручки" },
    ];
  }

  return [
    { account: BANK_ACCOUNT, debit: amount, credit: 0 },
    { account: counter, debit: 0, credit: amount },
  ];
}
