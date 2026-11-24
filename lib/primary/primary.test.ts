import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_COMPANY, DEMO_PERIOD } from "@/lib/ledger/demo";
import { defaultPolicy } from "@/lib/policy/types";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";
import { renderOfficialDocx } from "@/lib/docs/render-docx";
import { buildEntryDoc, buildRegister, peopleFromPolicy, primaryList, type PrimaryCtx } from "./build";
import { counterpartyOf, detect, docAmount, numberDocs, REGISTER_INFO, type DocKind, type RegisterKind } from "./detect";
import type { LedgerEntry } from "@/lib/ledger/types";

const e = (id: string, date: string, description: string, lines: Array<[string, number, number]>, source: LedgerEntry["source"] = "manual"): LedgerEntry =>
  ({ id, date, description, source, lines: lines.map(([account, debit, credit]) => ({ account, debit, credit })) });

test("документ по корреспонденции счетов", () => {
  assert.deepEqual(detect(e("1", "2026-01-05", "Выручка", [["1110", 100, 0], ["6110", 0, 100]])), ["ko1"]);
  assert.deepEqual(detect(e("2", "2026-01-05", "Зарплата из кассы", [["3520", 100, 0], ["1110", 0, 100]])), ["ko2", "t53"]);
  assert.deepEqual(detect(e("3", "2026-01-05", "Материалы", [["1620", 100, 0], ["3110", 0, 100]])), ["m4"]);
  assert.deepEqual(detect(e("4", "2026-01-05", "В производство", [["1640", 100, 0], ["1620", 0, 100]])), ["m11"]);
  assert.deepEqual(detect(e("5", "2026-01-05", "Станок", [["2140", 100, 0], ["1210", 0, 100]])), ["os1"]);
  assert.deepEqual(detect(e("6", "2026-01-05", "Отгрузка", [["1410", 100, 0], ["6110", 0, 100]])), ["waybill", "invoice"]);
  assert.deepEqual(detect(e("7", "2026-01-05", "Услуги", [["1410", 100, 0], ["6110", 0, 100]]), true), ["act", "invoice"]);
  assert.deepEqual(detect(e("8", "2026-01-05", "Остатки", [["1110", 100, 0], ["5300", 0, 100]], "opening")), []);
});

test("нумерация с начала года, отдельно по видам", () => {
  const list = [
    e("a", "2026-12-30", "", [["1110", 10, 0], ["6110", 0, 10]]),
    e("b", "2027-01-02", "", [["1110", 10, 0], ["6110", 0, 10]]),
    e("c", "2027-01-03", "", [["8010", 5, 0], ["1110", 0, 5]]),
    e("d", "2027-01-04", "", [["1110", 7, 0], ["6110", 0, 7]]),
  ];
  const n = numberDocs(list);
  assert.equal(n.get("a")![0].number, 1);
  assert.equal(n.get("b")![0].number, 1);
  assert.equal(n.get("c")![0].number, 1);
  assert.equal(n.get("d")![0].number, 2);
});

test("контрагент из описания", () => {
  assert.equal(counterpartyOf(e("1", "2026-01-01", "Закупка ЛДСП у ОсОО «ТехноМебель», июль", [])), "ОсОО «ТехноМебель»");
  assert.equal(counterpartyOf(e("1", "2026-01-01", "Погашение кредита, Бакай Банк", [])), "Бакай Банк");
});

const ctx = (): PrimaryCtx => {
  const policy = { ...defaultPolicy({ name: DEMO_COMPANY.name, regime: DEMO_COMPANY.regime, activity: DEMO_COMPANY.activity }), director: "Асанов А.А." };
  return { companyName: DEMO_COMPANY.name, inn: "", people: peopleFromPolicy(policy), policy, entries: demoEntries() };
};

test("демо: каждый документ и регистр собирается, суммы совпадают с журналом", async () => {
  const c = ctx();
  const list = primaryList(c, DEMO_PERIOD);
  assert.ok(list.length > 20);
  const kinds = new Set(list.flatMap((r) => r.docs.map((d) => d.kind)));
  for (const k of ["ko1", "ko2", "m4", "m11", "os1", "t49", "waybill", "invoice"] as DocKind[]) assert.ok(kinds.has(k), `нет ${k}`);
  const byId = new Map(c.entries.map((x) => [x.id, x]));
  for (const r of list) {
    for (const d of r.docs) {
      const blocks = buildEntryDoc(d.kind, byId.get(r.entryId)!, d.number, c);
      assert.ok(blocks.length > 2 || blocks[0]?.t === "cashOrder", d.kind);
      assert.equal(d.amount, docAmount(byId.get(r.entryId)!, d.kind));
    }
  }
  for (const k of Object.keys(REGISTER_INFO) as RegisterKind[]) assert.ok(buildRegister(k, c, DEMO_PERIOD).length > 2, k);
  const first = list[0];
  const blocks = buildEntryDoc(first.docs[0].kind, byId.get(first.entryId)!, first.docs[0].number, c);
  assert.equal((await renderOfficialPdf({ title: "t", fileName: "t", blocks })).subarray(0, 4).toString(), "%PDF");
  assert.ok((await renderOfficialDocx({ title: "t", fileName: "t", blocks })).length > 3000);
});

test("кассовая книга: остаток на конец дня = остаток на начало + приход − расход", () => {
  const c = ctx();
  const blocks = buildRegister("ko4", c, DEMO_PERIOD);
  const tables = blocks.filter((b): b is Extract<typeof b, { t: "table" }> => b.t === "table");
  const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;
  assert.ok(tables.length > 3);
  for (const t of tables) {
    const open = num(t.rows[0][3]);
    const tot = t.rows[t.rows.length - 2];
    const close = num(t.rows[t.rows.length - 1][3]);
    assert.ok(Math.abs(open + num(tot[3]) - num(tot[4]) - close) < 0.01);
    assert.ok(close >= -0.005, "отрицательный остаток кассы");
  }
});

test("контрагент из выписки: плательщик для прихода, получатель для расхода", async () => {
  const { partyFromRaw } = await import("@/lib/bank-parser");
  const raw = { "Дата": "01.02.2026", "Плательщик": "ОсОО «Альфа»", "ИНН плательщика": "01234567890123", "Получатель": "ОсОО «Белес»", "ИНН получателя": "09876543210987", "Банк получателя": "Бакай Банк" };
  assert.deepEqual(partyFromRaw(raw, 500), { party: "ОсОО «Альфа»", partyInn: "01234567890123" });
  assert.deepEqual(partyFromRaw(raw, -500), { party: "ОсОО «Белес»", partyInn: "09876543210987" });
  assert.deepEqual(partyFromRaw({ "Контрагент": "ИП Асанов", "Сумма": 5 }, -5), { party: "ИП Асанов", partyInn: "" });
  assert.equal(partyFromRaw({ "Назначение": "комиссия" }, -5), null);
});


test("документы берут номенклатуру, количество и цену из строки журнала; ИНВ-3 по номенклатуре", async () => {
  const { buildEntryDoc, buildRegister } = await import("./build");
  const e = { id: "m", date: "2026-07-03", description: "Поступление материалов", source: "manual" as const, lines: [
    { account: "1620", debit: 128000, credit: 0, item: "ЛДСП 16 мм", qty: 40, unit: "лист" },
    { account: "3110", debit: 0, credit: 128000, party: "ОсОО «ТехноМебель»" },
  ] };
  const ctx = { companyName: "ОсОО «Т»", inn: "", people: { director: "", directorTitle: "Директор", chief: "", cashier: "", storekeeper: "" }, policy: null, entries: [e] };
  const txt = JSON.stringify(buildEntryDoc("m4", e, 1, ctx));
  assert.match(txt, /ЛДСП 16 мм/);
  // М-4 по бланку альбома: наименование, номенклатурный №, код и наименование единицы, по документу, принято, цена, сумма
  assert.match(txt, /"ЛДСП 16 мм","","625","л\.","40","40","3 200,00","128 000,00"/);
  assert.match(txt, /ОсОО «ТехноМебель»/);
  const inv = JSON.stringify(buildRegister("inv3", ctx, { from: "2026-07-01", to: "2026-07-31" }));
  assert.match(inv, /"1","1620","ЛДСП 16 мм","","625","л\.","3 200,00"/);
  assert.match(inv, /"40","128 000,00"\]/);
});

test("документы из журнала — по бланкам альбома: графы, номера граф, реквизиты, ориентация", async () => {
  const { buildEntryDoc, buildRegister } = await import("./build");
  const { albumLandscape, albumRegisterLandscape } = await import("./album");
  const e = { id: "k", date: "2026-07-08", description: "Розничная выручка", source: "manual" as const, lines: [
    { account: "1110", debit: 380000, credit: 0 }, { account: "6110", debit: 0, credit: 380000 },
  ] };
  const ctx = { companyName: "ОсОО «Т»", inn: "123", people: { director: "Асанов", directorTitle: "Директор", chief: "Бекова", cashier: "Кадырова", storekeeper: "" }, policy: null, entries: [e] };
  // кассовый ордер — компактный бланк альбома: квитанция сбоку, несколько ордеров на листе
  const ko1 = buildEntryDoc("ko1", e, 7, ctx);
  assert.equal(ko1.length, 1);
  assert.equal(ko1[0].t, "cashOrder");
  if (ko1[0].t === "cashOrder") {
    assert.deepEqual([ko1[0].order.kind, ko1[0].order.number, ko1[0].order.debit, ko1[0].order.credit, ko1[0].order.amount], ["ko1", "7", "1110", "6110", "380 000,00"]);
    assert.deepEqual([ko1[0].order.chief, ko1[0].order.cashier, ko1[0].order.date], ["Бекова", "Кадырова", "08.07.2026"]);
    assert.match(ko1[0].order.words, /^Триста восемьдесят тысяч сомов/);
  }
  const { renderOfficialPdf } = await import("@/lib/docs/render-pdf");
  const { renderOfficialDocx } = await import("@/lib/docs/render-docx");
  const three = { title: "ПКО", fileName: "ПКО", compact: true, blocks: [ko1[0], ko1[0], ko1[0]] };
  assert.ok((await renderOfficialPdf(three)).length > 1000);
  assert.ok((await renderOfficialDocx(three)).length > 1000);
  assert.equal(albumLandscape("m4"), true);
  assert.equal(albumLandscape("ko1"), false);
  assert.equal(albumRegisterLandscape("ko3"), true);
  const ko3 = JSON.stringify(buildRegister("ko3", ctx, { from: "2026-07-01", to: "2026-07-31" }));
  assert.match(ko3, /"08\.07\.2026","1","380 000,00","Розничная выручка","","","",""/);
  assert.match(ko3, /за период с 01\.07\.2026 по 31\.07\.2026/);
});

test("бланковая вёрстка: шапка как в альбоме, накладные по три на листе", async () => {
  const c = ctx();
  const nums = numberDocs(c.entries);
  const list = c.entries.filter((x) => (nums.get(x.id) ?? []).some((d) => d.kind === "waybill")).slice(0, 3);
  assert.equal(list.length, 3);
  const parts = list.map((e) => buildEntryDoc("waybill", e, nums.get(e.id)!.find((d) => d.kind === "waybill")!.number, c));
  assert.equal(parts[0][0].t, "formHead");
  assert.ok(parts[0].some((b) => b.t === "formTitle" && b.no === String(nums.get(list[0].id)!.find((d) => d.kind === "waybill")!.number)));
  const pdf = await renderOfficialPdf({ title: "t", fileName: "t", compact: true, blocks: parts.map((p) => ({ t: "unit", blocks: p })) });
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1, "три накладные — один лист");
  assert.ok((await renderOfficialDocx({ title: "t", fileName: "t", compact: true, blocks: parts.map((p) => ({ t: "unit", blocks: p })) })).length > 3000);
  // в бланке альбома номер документа и дата — в клетках
  const m11 = c.entries.find((x) => (nums.get(x.id) ?? []).some((d) => d.kind === "os1"))!;
  assert.ok(buildEntryDoc("os1", m11, 1, c).some((b) => b.t === "box" && b.heads.includes("Дата составления")));
});
