// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mack, parseTriangle, insurerMetrics, normInv } from "./insurance";
import { bankMetrics, bankStress, BANK_LIMITS, type BankInput } from "./bank";
import { execution, publicMetrics } from "./public";
import { status } from "./common";

// Taylor & Ashe (1983), incremental — классический пример Mack (1993): резерв 18 680 856, s.e. 2 447 095
const GENINS = `357848 766940 610542 482940 527326 574398 146342 139950 227229 67948
352118 884021 933894 1183289 445745 320996 527804 266172 425046
290507 1001799 926219 1016654 750816 146923 495992 280405
310608 1108250 776189 1562400 272482 352053 206286
443160 693190 991983 769488 504851 470639
396132 937085 847498 805037 705960
440832 847631 1131398 1063269
359480 1061648 1443370
376686 986608
344014`;

test("Страховщик: метод Мака на треугольнике Taylor–Ashe", () => {
  const m = mack(parseTriangle(GENINS, true));
  assert.ok(Math.abs(m.total.reserve - 18680856) < 5, `резерв ${m.total.reserve}`);
  assert.ok(Math.abs(m.total.se - 2447095) < 50, `s.e. ${m.total.se}`);
  assert.ok(Math.abs(m.rows[9].se - 1363155) < 50, `s.e. последнего года ${m.rows[9].se}`);
  assert.ok(m.total.q995 > m.total.q95 && m.total.q95 > m.total.reserve);
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5);
  const met = insurerMetrics({ gpw: 1000, npw: 800, npwPrev: 500, npe: 760, claims: 500, expenses: 300, investIncome: 30, surplus: 250, reservesBooked: 400, liabilities: 900, liquidAssets: 1000, investedAssets: 800 }, 500);
  assert.equal(status(met.find((x) => x.key === "npwS")!), "breach"); // 320 % > 300 %
  assert.equal(status(met.find((x) => x.key === "growth")!), "breach"); // +60 %
  assert.equal(met.find((x) => x.key === "def")!.value, 40);
});

const bank: BankInput = {
  cet1: 900, at1: 100, tier2: 200, rwa: 8000, exposure: 11000, liquidAssets: 3000, currentLiabilities: 6000, hqla: 1500, shortLiabilities: 4000,
  maxBorrower: 200, maxRelated: 100, maxBank: 300, fxPositions: [{ code: "USD", position: 150 }, { code: "EUR", position: -60 }],
  totalAssets: 12000, equity: 1300, netProfit: 260, interestIncome: 1300, interestExpense: 500, operatingIncome: 1100, operatingExpense: 550, loans: 7000, npl: 350, provisions: 280, deposits: 8500,
};

test("Банк: нормативы НБКР и стресс-тест", () => {
  const r = bankMetrics(bank);
  const v = (k: string) => r.normatives.find((x) => x.key === k)!;
  assert.equal(v("k21").value, 15); assert.equal(status(v("k21")), "ok");
  assert.equal(v("k31").value, 50);
  assert.equal(v("k41").value, 12.5);
  assert.equal(status(v("k13")), "ok");
  const s = bankStress(bank, { nplShock: 10, lgd: 60, fxShock: 20, outflow: 15 });
  assert.equal(Math.round(s.creditLoss), 420);
  assert.equal(Math.round(s.fxResult), 18); // (150 − 60) × 20 %
  assert.ok(s.breaches.some((b) => b.startsWith("К2.3")) || s.rows[2].k21! < BANK_LIMITS.k21);
});

test("Госсектор: исполнение бюджета", () => {
  const lines = [
    { code: "1", name: "Субвенции", kind: "revenue" as const, original: 1000, final: 1100, actual: 1100 },
    { code: "2", name: "Платные услуги", kind: "revenue" as const, original: 200, final: 200, actual: 150, own: true },
    { code: "211", name: "Оплата труда", kind: "expense" as const, original: 800, final: 850, actual: 840 },
    { code: "222", name: "Приобретение услуг", kind: "expense" as const, original: 400, final: 450, actual: 300 },
  ];
  const e = execution(lines);
  assert.equal(e.balance.actual, 1250 - 1140);
  const m = publicMetrics(lines, { payables: 57, overduePayables: 0, receivables: 25, staffCost: 840 });
  assert.equal(m.find((x) => x.key === "exp")!.value, 87.69);
  assert.equal(status(m.find((x) => x.key === "exp")!), "breach");
  assert.equal(m.find((x) => x.key === "own")!.value, 12);
});
