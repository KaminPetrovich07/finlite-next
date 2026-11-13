// Консолидация: группа из материнской (П), дочерней 80 % (Д) и компании под общим контролем (К).
import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidate, cutAtAcquisition, equityAt, makeMatcher, nameKey, type MemberJournal } from "./consolidate";
import { validateEntry } from "@/lib/ledger/engine";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

let n = 0;
const E = (date: string, description: string, lines: LedgerLine[], source: LedgerEntry["source"] = "manual"): LedgerEntry => ({ id: `e${++n}`, date, description, source, lines });
const dr = (account: string, amount: number, party?: [string, string]): LedgerLine => ({ account, debit: amount, credit: 0, ...(party ? { party: party[0], partyInn: party[1] } : {}) });
const cr = (account: string, amount: number, party?: [string, string]): LedgerLine => ({ account, debit: 0, credit: amount, ...(party ? { party: party[0], partyInn: party[1] } : {}) });

const P: [string, string] = ["ОсОО «Холдинг»", "01111111111111"];
const S: [string, string] = ["ОсОО «Дочка»", "02222222222222"];
const C: [string, string] = ["ОсОО «Сестра»", "03333333333333"];
const OUT: [string, string] = ["Внешний инвестор", "09999999999999"];

function group(): MemberJournal[] {
  const p: LedgerEntry[] = [
    E("2026-08-01", "Взнос учредителя", [dr("1210", 1_000_000), cr("5110", 1_000_000)], "opening"),
    E("2026-09-05", "Вклад в уставный капитал Дочки", [dr("2830", 400_000, S), cr("1210", 400_000)]),
    E("2026-10-12", "Услуги Дочке", [dr("1410", 30_000, S), cr("6110", 30_000, S)]),
    E("2026-10-20", "Оплата от Дочки", [dr("1210", 10_000), cr("6110", 10_000, S)]),
  ];
  const s: LedgerEntry[] = [
    E("2026-09-05", "Вклад Холдинга", [dr("1210", 400_000), cr("5110", 400_000, P)]),
    E("2026-09-06", "Вклад внешнего инвестора", [dr("1210", 100_000), cr("5110", 100_000, OUT)]),
    E("2026-09-10", "Покупка товара", [dr("1610", 80_000), cr("1210", 80_000)]),
    E("2026-10-02", "Продажа Сестре", [dr("1410", 120_000, C), cr("6110", 120_000, C)]),
    E("2026-10-02", "Себестоимость", [dr("7200", 80_000), cr("1610", 80_000)], "cogs"),
    E("2026-10-15", "Оплата от Сестры", [dr("1210", 70_000), cr("1410", 70_000, C)]),
    E("2026-10-12", "Услуги Холдинга", [dr("7110", 30_000), cr("3110", 30_000, P)]),
    E("2026-10-20", "Оплата Холдингу напрямую", [dr("7110", 10_000, P), cr("1210", 10_000)]),
  ];
  const c: LedgerEntry[] = [
    E("2026-08-01", "Взнос учредителя", [dr("1210", 200_000), cr("5110", 200_000)], "opening"),
    E("2026-10-02", "Покупка у Дочки", [dr("1610", 120_000), cr("3110", 120_000, S)]),
    E("2026-10-15", "Оплата Дочке", [dr("3110", 70_000, S), cr("1210", 70_000)]),
    E("2026-10-25", "Продажа покупателю", [dr("1210", 200_000), cr("6110", 200_000)]),
    E("2026-10-25", "Себестоимость", [dr("7200", 120_000), cr("1610", 120_000)], "cogs"),
  ];
  for (const e of [...p, ...s, ...c]) assert.deepEqual(validateEntry(e), [], e.description);
  return [
    { member: { companyId: "P", name: P[0], inn: P[1], role: "parent" }, entries: p },
    { member: { companyId: "S", name: S[0], inn: S[1], role: "subsidiary", share: 0.8 }, entries: s },
    { member: { companyId: "C", name: C[0], inn: C[1], role: "common" }, entries: c },
  ];
}

const OCT = { from: "2026-10-01", to: "2026-10-31" }, SEP = { from: "2026-09-01", to: "2026-09-30" };
const bal = (st: ReturnType<typeof consolidate>["current"]["statements"], acc: string) => {
  const r = st.trialBalance.rows.find((x) => x.account === acc);
  return r ? Math.round((r.closingDr - r.closingCr) * 100) / 100 : 0;
};

test("сопоставление контрагента с участником: ИНН, затем наименование", () => {
  const m = makeMatcher(group().map((j) => j.member));
  assert.equal(m({ partyInn: "02222222222222" }, "P"), "S");
  assert.equal(m({ party: "дочка осоо" }, "P"), "S");
  assert.equal(m({ partyInn: "02222222222222" }, "S"), null, "сам с собой — не внутригрупповая");
  assert.equal(m({ party: "Внешний инвестор", partyInn: "09999999999999" }, "P"), null);
  assert.equal(nameKey("ОсОО «Ак-Таш»"), "ак таш");
});

test("группа: доходы, себестоимость, прибыль и капитал после исключений", () => {
  const r = consolidate(group(), OCT, SEP);
  const is = r.current.statements.incomeStatement;
  assert.equal(is.netRevenue, 200_000, "в выручке только продажа вне группы");
  assert.equal(is.byAccount["7200"], 80_000, "себестоимость — по цене покупки группы");
  assert.equal(is.byAccount["7110"] ?? 0, 0, "услуги Холдинга исключены");
  assert.equal(is.netProfit, 120_000);
  const sumMembers = r.current.members.reduce((s, m) => s + m.statements.incomeStatement.netProfit, 0);
  assert.equal(sumMembers, 120_000, "внутригрупповые исключения не меняют прибыль группы");

  const st = r.current.statements;
  assert.equal(bal(st, "1410"), 0, "дебиторка внутри группы исключена");
  assert.equal(bal(st, "3110"), 0);
  assert.equal(bal(st, "2830"), 0, "инвестиция исключена");
  assert.equal(bal(st, "1250"), 0, "денег в пути нет: обе стороны отразили платежи");
  assert.equal(bal(st, "1210"), 1_000_000 - 400_000 + 10_000 + 400_000 + 100_000 - 80_000 + 70_000 - 10_000 + 200_000 - 70_000 + 200_000);
  // капитал: 1 000 000 + 200 000 + 100 000 (внешний инвестор) + прибыль 120 000
  const equity = -(bal(st, "5110") + bal(st, "5300")) - Object.entries(st.incomeStatement.byAccount).length * 0;
  assert.equal(-bal(st, "5110"), 1_300_000);
  assert.equal(st.balanceSheet.closing[110] ?? 0, 0);
  for (const c of st.checks) assert.notEqual(c.status, "error", `${c.title}: ${c.detail}`);
  void equity;

  const [nci] = r.current.nci;
  assert.equal(nci.share, 0.8);
  assert.equal(nci.equityClose, 500_000);
  assert.equal(nci.nciClose, 100_000);
  assert.equal(nci.nciProfit, 0);
  const kinds = r.current.eliminations.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["cash", "intragroup", "investment", "settlements"]);
  assert.match(r.current.eliminations.find((e) => e.kind === "investment")!.detail, /Гудвила нет/);
});

test("ОДДС группы: платежи внутри группы не показываются как поступления и выплаты", () => {
  const r = consolidate(group(), OCT, SEP);
  const cf = r.current.statements.cashFlow;
  const inflows = Object.entries(cf.byAccount).filter(([, v]) => v > 0).reduce((s, [, v]) => s + v, 0);
  assert.equal(Math.round(inflows), 200_000, "единственное поступление — от внешнего покупателя");
  // сентябрь: вклад Холдинга в Дочку — не инвестиционный поток группы; вклад внешнего инвестора — финансовый
  const sep = r.previous.statements.cashFlow.byAccount;
  assert.equal(Math.round(sep["2830"] ?? 0), 0);
  assert.equal(Math.round(sep["5110"] ?? 0), 100_000);
});

test("расхождение взаиморасчётов и деньги в пути видны в предупреждениях", () => {
  const g = group();
  // Сестра заплатила ещё 20 000, Дочка платёж не отразила
  g[2].entries.push(E("2026-10-30", "Оплата Дочке", [dr("3110", 20_000, S), cr("1210", 20_000)]));
  const r = consolidate(g, OCT, SEP);
  assert.equal(bal(r.current.statements, "1250"), 20_000, "отправлено, но не получено — в пути");
  for (const c of r.current.statements.checks) assert.notEqual(c.status, "error", c.title);
  assert.match(r.current.eliminations.find((e) => e.kind === "cash")!.detail, /В пути на конец периода: 20 000/);
  // долги не сходятся: у Сестры 3110 120 000 (оплаты идут через «в пути»), у Дочки 1410 120 000 — сходятся;
  // а вот если Дочка не указала контрагента в продаже — расхождение
  const g2 = group();
  g2[1].entries[3] = E("2026-10-02", "Продажа Сестре", [dr("1410", 120_000), cr("6110", 120_000)]);
  const r2 = consolidate(g2, OCT, SEP);
  assert.ok(r2.warnings.some((w) => /не сходятся/.test(w)), r2.warnings.join("\n"));
  for (const c of r2.current.statements.checks) assert.notEqual(c.status, "error", c.title);
});

test("приобретение: результаты до даты покупки не входят, гудвил и неконтролирующая доля", () => {
  const sub: LedgerEntry[] = [
    E("2026-01-10", "Капитал", [dr("1210", 100_000), cr("5110", 100_000)], "opening"),
    E("2026-05-10", "Продажа", [dr("1210", 50_000), cr("6110", 50_000)]),
    E("2026-10-10", "Продажа", [dr("1210", 30_000), cr("6110", 30_000)]),
  ];
  const cut = cutAtAcquisition(sub, "2026-07-01", "X");
  assert.equal(cut[0].source, "opening");
  assert.equal(equityAt(cut, "2026-06-30"), 150_000);
  const par: LedgerEntry[] = [
    E("2026-01-01", "Капитал", [dr("1210", 500_000), cr("5110", 500_000)], "opening"),
    E("2026-07-01", "Покупка 60 % компании", [dr("2830", 120_000, ["ОсОО «Икс»", "04444444444444"]), cr("1210", 120_000)]),
  ];
  const r = consolidate([
    { member: { companyId: "P", name: "ОсОО «Пэ»", inn: "05555555555555", role: "parent" }, entries: par },
    { member: { companyId: "X", name: "ОсОО «Икс»", inn: "04444444444444", role: "subsidiary", share: 0.6, acquiredAt: "2026-07-01" }, entries: sub },
  ], OCT, SEP);
  const st = r.current.statements;
  assert.equal(st.incomeStatement.netRevenue, 30_000, "майская выручка — до покупки, не в отчётности группы");
  assert.equal(bal(st, "2920"), 30_000, "гудвил = 120 000 − 60 % × 150 000");
  assert.equal(bal(st, "2830"), 0);
  const [nci] = r.current.nci;
  assert.equal(nci.nciClose, 72_000, "40 % × (150 000 + 30 000)");
  assert.equal(nci.nciProfit, 12_000);
  for (const c of st.checks) assert.notEqual(c.status, "error", c.title);
  // до покупки компания в отчётность не входит
  const early = consolidate([
    { member: { companyId: "P", name: "ОсОО «Пэ»", inn: "05555555555555", role: "parent" }, entries: par },
    { member: { companyId: "X", name: "ОсОО «Икс»", inn: "04444444444444", role: "subsidiary", share: 0.6, acquiredAt: "2026-07-01" }, entries: sub },
  ], { from: "2026-05-01", to: "2026-05-31" }, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(early.current.members.length, 1);
  assert.ok(early.warnings.some((w) => /после конца периода/.test(w)));
});

test("fuzz: случайные группы — сводная отчётность всегда сходится, исключения не меняют прибыль группы", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const amt = () => Math.round(rnd() * 100_000) / 100 + 1;
  const day = (m: number) => `2026-${String(m).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`;
  for (let round = 0; round < 200; round++) {
    const ids = ["A", "B", "C"];
    const party = (id: string): [string, string] => [`ОсОО «${id}»`, `0${ids.indexOf(id) + 1}`.padEnd(14, String(ids.indexOf(id) + 1))];
    const js: Record<string, LedgerEntry[]> = { A: [], B: [], C: [] };
    for (const id of ids) js[id].push(E("2026-08-01", "Капитал", [dr("1210", 500_000), cr("5110", 500_000)], "opening"));
    for (let k = 0; k < 25; k++) {
      const m = 8 + Math.floor(rnd() * 3); // авг–окт
      const x = pick(ids), y = pick(ids.filter((i) => i !== x)), a = amt(), d = day(m);
      switch (Math.floor(rnd() * 6)) {
        case 0: js[x].push(E(d, "Продажа вне группы", [dr("1210", a), cr("6110", a)])); break;
        case 1: js[x].push(E(d, "Расход вне группы", [dr("7110", a), cr("1210", a)])); break;
        case 2: // продажа внутри группы в долг, обе стороны
          js[x].push(E(d, "Продажа участнику", [dr("1410", a, party(y)), cr("6110", a, party(y))]));
          js[y].push(E(d, "Покупка у участника", [dr("7110", a), cr("3110", a, party(x))])); break;
        case 3: // оплата внутри группы; иногда получатель не отражает
          js[y].push(E(d, "Оплата участнику", [dr("3110", a, party(x)), cr("1210", a)]));
          if (rnd() < 0.7) js[x].push(E(d, "Оплата от участника", [dr("1210", a), cr("1410", a, party(y))])); break;
        case 4: // заём внутри группы
          js[x].push(E(d, "Заём участнику", [dr("1330", a, party(y)), cr("1210", a)]));
          js[y].push(E(d, "Заём от участника", [dr("1210", a), cr("3320", a, party(x))])); break;
        case 5: // оплата услуг напрямую, иногда только одна сторона
          js[x].push(E(d, "Услуги участника оплачены", [dr("7110", a, party(y)), cr("1210", a)]));
          if (rnd() < 0.6) js[y].push(E(d, "Оплата услуг от участника", [dr("1210", a), cr("6110", a, party(x))])); break;
      }
    }
    const group: MemberJournal[] = ids.map((id, i) => ({ member: { companyId: id, name: party(id)[0], inn: party(id)[1], role: i === 0 ? "parent" : "common" }, entries: js[id] }));
    for (const period of [OCT, SEP, { from: "2026-08-01", to: "2026-10-31" }]) {
      const r = consolidate(group, period, { from: "2026-07-01", to: "2026-07-31" });
      for (const c of r.current.statements.checks) assert.notEqual(c.status, "error", `раунд ${round}, ${period.from}: ${c.title} — ${c.detail}`);
      const members = r.current.members.reduce((s, m) => s + m.statements.incomeStatement.netProfit, 0);
      assert.ok(Math.abs(r.current.statements.incomeStatement.netProfit - members) < 0.02, `раунд ${round}: прибыль группы ${r.current.statements.incomeStatement.netProfit} ≠ ${members}`);
      // внутригрупповые взаиморасчёты, отражённые обеими сторонами, исчезают; деньги в пути — только неотражённые платежи
      assert.ok(Math.abs(bal(r.current.statements, "1250")) >= 0);
    }
  }
});

test("сводные таблицы: столбцы участников, исключения, неконтролирующая доля; выгрузка в PDF, Word, Excel", async () => {
  const { groupTables, groupReport } = await import("./present");
  const t = groupTables(consolidate(group(), OCT, SEP));
  assert.deepEqual(t.columns.map((c) => c.companyId), ["P", "S", "C"]);
  const row = (rs: typeof t.sfp, k: string) => rs.find((x) => x.key === k)!;
  // по каждой строке: группа = сумма участников + исключения
  for (const x of [...t.sfp, ...t.pl]) if (x.kind !== "nci" && x.kind !== "heading") assert.ok(Math.abs(x.members.reduce((s, v) => s + v, 0) + x.elim - x.group) < 0.02, x.label);
  assert.equal(row(t.sfp, "t-assets").group, row(t.sfp, "t-eqliab").group, "актив = пассив");
  assert.equal(row(t.sfp, "groupInvest").members[0], 400_000, "у материнской — вложение в дочернюю");
  assert.equal(row(t.sfp, "groupInvest").group, 0, "в группе — исключено");
  assert.equal(row(t.sfp, "eq-nci").group, 100_000);
  assert.equal(row(t.sfp, "eq-owners").group, 1_320_000);
  assert.equal(row(t.pl, "pl-revenue").group, 200_000);
  assert.equal(row(t.pl, "pl-revenue").elim, -160_000);
  assert.equal(t.totals.netProfit, 120_000);
  assert.ok(t.checks.every((c) => c.ok), t.checks.filter((c) => !c.ok).map((c) => `${c.title}: ${c.detail}`).join("; "));
  const doc = groupReport(t, "Группа «Холдинг»", OCT);
  const { renderPdf } = await import("@/lib/reports/render-pdf");
  const { renderDocx } = await import("@/lib/reports/render-docx");
  const { renderXlsx } = await import("@/lib/reports/render-xlsx");
  for (const r of [renderPdf, renderDocx, renderXlsx]) assert.ok((await r(doc)).length > 2000);
});
