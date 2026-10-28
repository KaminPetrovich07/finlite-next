// ════════════════════════════════════════════════════════════════════════
// lib/ledger/calc-bridge.ts — журнал проводок → входные данные калькулятора.
//
// Калькулятор, сравнение режимов и сводка руководителя считают по
// упрощённой модели (выручка, себестоимость, ФОТ, аренда, расходы…).
// Здесь каждая статья ОПиУ раскладывается в эти поля по счетам Плана
// счетов, так что все страницы работают с одними и теми же цифрами.
//
// Налоги калькулятор считает сам, поэтому начисленные налоги (9910, налог
// с продаж 8190 при общем режиме) и взносы работодателя (их калькулятор
// начисляет от ФОТ) из расходов исключаются — иначе они учлись бы дважды.
// ════════════════════════════════════════════════════════════════════════

import { getAccount } from "./accounts";
import type { Statements } from "./engine";
import { REGIME_INFO, type CalculateInput, type RegimeKey } from "@/lib/tax-engine";

export interface BridgeLine {
  field: keyof CalculateInput;
  label: string;
  amount: number;
  accounts: string[];
}

export interface Bridge {
  input: CalculateInput;
  /** где взята каждая цифра — для подсказок и проверки */
  lines: BridgeLine[];
  /** что не перенесено и почему */
  skipped: Array<{ account: string; amount: number; reason: string }>;
}

const LABEL: Partial<Record<keyof CalculateInput, string>> = {
  revenue: "Выручка", otherIncome: "Прочие операционные доходы", cogs: "Себестоимость (без зарплаты)",
  salaries: "Фонд оплаты труда", rent: "Аренда", sellingExp: "Расходы по реализации (без зарплаты)",
  adminExp: "Административные расходы (без зарплаты и аренды)", otherOpExp: "Прочие операционные расходы",
  interestExp: "Проценты к уплате", investInc: "Доходы от инвестиций и прочие неоперационные доходы",
  otherNonOp: "Прочие неоперационные и чрезвычайные статьи (сальдо)",
};

export function calcInputFromStatements(s: Statements, regimeKey: RegimeKey, patentMonthly = 0): Bridge {
  const is = s.incomeStatement;
  const general = REGIME_INFO[regimeKey]?.kind === "general";
  const acc: Partial<Record<keyof CalculateInput, { amount: number; accounts: string[] }>> = {};
  const add = (f: keyof CalculateInput, code: string, v: number) => {
    const x = (acc[f] ??= { amount: 0, accounts: [] });
    x.amount += v;
    if (!x.accounts.includes(code)) x.accounts.push(code);
  };
  const skipped: Bridge["skipped"] = [];

  for (const [code, amount] of Object.entries(is.byAccount)) {
    if (Math.abs(amount) < 0.005) continue;
    const a = getAccount(code);
    if (!a?.pl) continue;
    if (a.pl === "revenue") { add("revenue", code, amount); continue; }
    if (a.pl === "incomeTax") { skipped.push({ account: code, amount, reason: "налог на прибыль / единый налог считает калькулятор" }); continue; }
    if (a.nature === "social") { skipped.push({ account: code, amount, reason: "взносы работодателя калькулятор начисляет от ФОТ" }); continue; }
    if (code === "8190" && general) { skipped.push({ account: code, amount, reason: "налог с продаж при общем режиме считает калькулятор" }); continue; }
    if (a.nature === "payroll") { add("salaries", code, amount); continue; }
    if (a.nature === "rent") { add("rent", code, amount); continue; }
    if (a.nature === "interest") { add("interestExp", code, amount); continue; }
    switch (a.pl) {
      case "otherOpIncome": add("otherIncome", code, amount); break;
      case "cogs": add("cogs", code, amount); break;
      case "selling": add("sellingExp", code, amount); break;
      case "admin": add("adminExp", code, amount); break;
      case "otherOpExpense": add("otherOpExp", code, amount); break;
      case "nonOpIncome": add("investInc", code, amount); break;
      case "nonOpExpense": add("otherNonOp", code, -amount); break;
      case "extraordinaryIncome": add("otherNonOp", code, amount); break;
      case "extraordinaryExpense": add("otherNonOp", code, -amount); break;
    }
  }

  const v = (f: keyof CalculateInput) => Math.round((acc[f]?.amount ?? 0) * 100) / 100;
  const revenueTotal = v("revenue") + v("otherIncome");
  const input: CalculateInput = {
    regimeKey,
    revenue: v("revenue"), otherIncome: v("otherIncome"), cogs: v("cogs"), salaries: v("salaries"), rent: v("rent"),
    sellingExp: v("sellingExp"), adminExp: v("adminExp"), otherOpExp: v("otherOpExp"),
    interestExp: v("interestExp"), otherNonOp: v("otherNonOp"), investInc: v("investInc"),
    cashPct: revenueTotal > 0 ? Math.min(100, (s.taxes.cashRevenue / revenueTotal) * 100) : 0,
    patentAmount: patentMonthly,
  };
  const lines = (Object.keys(acc) as Array<keyof CalculateInput>).map((f) => ({
    field: f, label: LABEL[f] ?? String(f), amount: v(f), accounts: acc[f]!.accounts.sort(),
  }));
  return { input, lines, skipped };
}
