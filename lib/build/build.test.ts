// Стройка: смета, проводки документов, себестоимость актов КС-2, анализ «смета — факт», КС-3, вставка из Excel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEntry } from "@/lib/ledger/engine";
import {
  analyze, bdocLines, bdocTotals, estimateTotals, ks2Cost, ks2CostByStage, ks3Rows, nextNumber, parsePasted, parseRef, bdocRef,
  sampleDocs, sampleObject, validateBuildDoc, validateObject, type BuildDoc, type BuildObject,
} from "./model";

function obj(): BuildObject {
  return {
    id: "o1", name: "Склад", customer: "ОсОО «Тайга»", customerInn: "01234567890123", vat: true, retentionPct: 5, status: "active",
    stages: [{ id: "s1", name: "Этап 1" }, { id: "s2", name: "Этап 2" }],
    works: [
      { id: "w1", stageId: "s1", code: "1.1", name: "Обшивка стен", unit: "м2", qty: 32, price: 15625 },
      { id: "w2", stageId: "s2", name: "Укладка плитки", unit: "м", qty: 8, price: 7500 },
    ],
    resources: [
      { id: "r1", stageId: "s1", type: "material", name: "Плита OSB", unit: "лист", qty: 60, price: 1500 },
      { id: "r2", stageId: "s1", type: "labor", name: "Плотники", unit: "чел.-дн", qty: 40, price: 2500 },
      { id: "r3", stageId: "s2", type: "material", name: "Плитка", unit: "м2", qty: 14, price: 1000 },
    ],
  };
}
const wo = (n: string, date: string, rows: BuildDoc["rows"]): BuildDoc => ({ type: "writeoff", objectId: "o1", number: n, date, rows });

test("смета: работы, затраты по видам, плановая маржа", () => {
  const e = estimateTotals(obj());
  assert.equal(e.works, 560000);
  assert.equal(e.byType.material, 104000);
  assert.equal(e.byType.labor, 100000);
  assert.equal(e.cost, 204000);
  assert.equal(e.margin, 356000);
  assert.equal(estimateTotals(obj(), "s2").works, 60000);
  assert.deepEqual(validateObject(obj()), []);
  assert.ok(validateObject({ ...obj(), stages: [] }).length > 0);
});

test("списание материалов: Дт 1630 — Кт 1620 с количеством; проводка сходится", () => {
  const d = wo("1", "2026-10-20", [{ name: "Плита OSB", unit: "лист", qty: 30, price: 1450, stageId: "s1", account: "1620" }]);
  const lines = bdocLines(d, obj());
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [["1630", 43500, 0], ["1620", 0, 43500]]);
  assert.equal(lines[1].qty, 30);
  assert.match(lines[0].memo!, /Склад.*Этап 1.*Плита OSB/);
  assert.deepEqual(validateEntry({ date: d.date, lines }), []);
});

test("затраты: субподряд в долг с НДС, перенос зарплаты; материалы — только списанием", () => {
  const o = obj();
  const c: BuildDoc = { type: "cost", objectId: "o1", number: "1", date: "2026-10-25", pay: "credit", party: "ИП Батыров", rows: [{ name: "Монтаж", unit: "усл", qty: 1, price: 50000, vat: 6000, costType: "subcontract", stageId: "s1" }] };
  assert.deepEqual(bdocLines(c, o).map((l) => [l.account, l.debit, l.credit]), [["1630", 50000, 0], ["1540", 6000, 0], ["3110", 0, 56000]]);
  assert.equal(bdocLines(c, o)[2].party, "ИП Батыров");
  const rc: BuildDoc = { type: "cost", objectId: "o1", number: "2", date: "2026-10-31", pay: "reclass", reclass: "7120", rows: [{ name: "Зарплата бригады", unit: "мес", qty: 1, price: 80000, vat: 999, costType: "labor" }] };
  assert.deepEqual(bdocLines(rc, o).map((l) => [l.account, l.debit, l.credit]), [["1630", 80000, 0], ["7120", 0, 80000]]);
  assert.deepEqual(validateBuildDoc(rc, o), []);
  assert.ok(validateBuildDoc({ ...rc, reclass: "1010" }, o).some((p) => /счёт/.test(p)));
  assert.ok(validateBuildDoc({ ...c, rows: [{ ...c.rows[0], costType: "material" }] }, o).some((p) => /Списание материалов/.test(p)));
});

test("КС-2: выручка 6140 с объёмом, НДС 12 %, себестоимость — доля НЗП по смете", () => {
  const o = obj();
  const docs: BuildDoc[] = [
    wo("1", "2026-10-20", [{ name: "Плита OSB", unit: "лист", qty: 60, price: 1450, stageId: "s1", account: "1620" }]),
    { type: "cost", objectId: "o1", number: "1", date: "2026-10-25", pay: "reclass", reclass: "7120", rows: [{ name: "Плотники", unit: "мес", qty: 1, price: 113000, costType: "labor", stageId: "s1" }] },
  ];
  const act: BuildDoc = { type: "ks2", objectId: "o1", number: "1", date: "2026-10-30", rows: [{ workId: "w1", stageId: "s1", name: "Обшивка стен", unit: "м2", qty: 16, price: 15625 }] };
  // НЗП этапа 1 — 200 000; акт 250 000 из 500 000 несданных работ этапа → половина
  act.costByStage = ks2CostByStage(act, o, docs);
  act.cost = ks2Cost(act, o, docs);
  assert.equal(act.cost, 100000);
  assert.deepEqual(act.costByStage, { s1: 100000 });
  const t = bdocTotals(act, o);
  assert.deepEqual([t.net, t.vat, t.gross], [250000, 30000, 280000]);
  const lines = bdocLines(act, o);
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [["1410", 280000, 0], ["6140", 0, 250000], ["3430", 0, 30000], ["7400", 100000, 0], ["1630", 0, 100000]]);
  assert.equal(lines[0].partyInn, "01234567890123");
  assert.equal(lines[1].qty, 16);
  assert.deepEqual(validateEntry({ date: act.date, lines }), []);
  // последний акт списывает весь остаток
  const last: BuildDoc = { type: "ks2", objectId: "o1", number: "2", date: "2026-11-30", rows: [{ workId: "w1", stageId: "s1", name: "Обшивка стен", unit: "м2", qty: 16, price: 15625 }, { workId: "w2", stageId: "s2", name: "Укладка плитки", unit: "м", qty: 8, price: 7500 }] };
  assert.equal(ks2Cost(last, o, [...docs, act]), 100000);
  // затраты этапа 2 без акта по нему остаются в НЗП, пока акт не «последний»
  const tile = wo("9", "2026-11-20", [{ name: "Плитка", unit: "м2", qty: 14, price: 1000, stageId: "s2", account: "1620" }]);
  assert.equal(ks2Cost({ ...last, rows: last.rows.slice(0, 1) }, o, [...docs, act, tile]), 100000);
  assert.equal(ks2Cost({ ...last, rows: last.rows.slice(0, 1), final: true }, o, [...docs, act, tile]), 114000);
});

test("анализ: план-факт по этапам и видам, нормы материалов, докупить, предупреждения", () => {
  const o = obj();
  const docs: BuildDoc[] = [
    wo("1", "2026-10-20", [{ name: "Плита OSB", unit: "лист", qty: 66, price: 1450, stageId: "s1", account: "1620" }]),
    wo("2", "2026-11-05", [{ name: "Плитка", unit: "м2", qty: 4, price: 1100, stageId: "s2", account: "1620" }, { name: "Саморезы", unit: "кг", qty: 2, price: 300, stageId: "s1", account: "1620" }]),
    { type: "cost", objectId: "o1", number: "1", date: "2026-10-31", pay: "reclass", reclass: "7120", rows: [{ name: "Плотники", unit: "мес", qty: 1, price: 90000, costType: "labor", stageId: "s1" }] },
  ];
  const act: BuildDoc = { type: "ks2", objectId: "o1", number: "1", date: "2026-10-31", rows: [{ workId: "w1", name: "Обшивка стен", unit: "м2", qty: 32, price: 15625 }] };
  act.costByStage = ks2CostByStage(act, o, docs);
  act.cost = ks2Cost(act, o, docs);
  const a = analyze(o, [...docs, act], new Map([["плитка", 3]]));
  assert.equal(a.factCost, 190700);
  assert.equal(a.factByType.material, 100700);
  assert.equal(a.factByType.labor, 90000);
  assert.equal(a.accepted, 500000);
  assert.equal(a.progress, 89.29);
  const s1 = a.stages.find((s) => s.stageId === "s1")!;
  assert.equal(s1.factCost, 95700 + 600 + 90000);
  assert.equal(s1.accepted, 500000);
  assert.equal(s1.progress, 100);
  assert.equal(s1.writtenOff, 185700);
  assert.equal(s1.profit, 314300);
  const osb = a.materials.find((m) => m.name === "Плита OSB")!;
  assert.deepEqual([osb.planQty, osb.factQty, osb.qtyVariance, osb.qtyVariancePct], [60, 66, 6, 10]);
  const tile = a.materials.find((m) => m.name === "Плитка")!;
  assert.deepEqual([tile.needQty, tile.onHand, tile.toBuy], [10, 3, 7]);
  assert.ok(a.warnings.some((w) => /Перерасход «Плита OSB»/.test(w)));
  assert.ok(a.warnings.some((w) => /Саморезы.*нет/.test(w)));
  assert.equal(a.retention, 28000);
  assert.equal(a.wip, Math.round((a.factCost - a.writtenOff) * 100) / 100);
  assert.deepEqual(a.months.map((m) => m.month), ["2026-10", "2026-11"]);
});

test("КС-3: с начала работ, с начала года, за период — по этапам", () => {
  const o = obj();
  const a1: BuildDoc = { type: "ks2", objectId: "o1", number: "1", date: "2025-12-20", rows: [{ workId: "w1", name: "Обшивка", unit: "м2", qty: 10, price: 15625 }] };
  const a2: BuildDoc = { type: "ks2", objectId: "o1", number: "2", date: "2026-02-10", rows: [{ workId: "w1", name: "Обшивка", unit: "м2", qty: 12, price: 15625 }] };
  const a3: BuildDoc = { type: "ks2", objectId: "o1", number: "3", date: "2026-03-10", rows: [{ workId: "w1", name: "Обшивка", unit: "м2", qty: 10, price: 15625 }, { workId: "w2", name: "Плитка", unit: "м", qty: 8, price: 7500 }] };
  const rows = ks3Rows(o, [a1, a2, a3], a3);
  assert.deepEqual(rows.map((r) => [r.name, r.fromStart, r.fromYear, r.period]), [["Этап 1", 500000, 343750, 156250], ["Этап 2", 60000, 60000, 60000]]);
  assert.deepEqual(ks3Rows(o, [a1, a2, a3], a2).map((r) => r.fromStart), [343750]);
});

test("вставка сметы из Excel: шифр, наименование, единица, объём, цена; итоги пропускаются", () => {
  const rows = parsePasted([
    "№\tНаименование\tЕд.\tКол-во\tЦена",
    "1\t1.1\tМонтаж каркаса из бруса\tм2\t32\t4 500,00",
    "2\tФЕР10-01-002\tОбшивка стен OSB\tм2\t32\t11125",
    "Брус 100×100;м3;2,4;22000",
    "Итого\t\t\t\t560000",
  ].join("\n"));
  assert.deepEqual(rows, [
    { code: "1.1", name: "Монтаж каркаса из бруса", unit: "м2", qty: 32, price: 4500 },
    { code: "ФЕР10-01-002", name: "Обшивка стен OSB", unit: "м2", qty: 32, price: 11125 },
    { name: "Брус 100×100", unit: "м3", qty: 2.4, price: 22000 },
  ]);
});

test("номера и ссылки документов; пример объекта проходит проверку", () => {
  assert.equal(nextNumber([{ type: "ks2", objectId: "o1", number: "1" }, { type: "ks2", objectId: "o1", number: "4" }, { type: "ks2", objectId: "o2", number: "9" }, { type: "writeoff", objectId: "o1", number: "7" }], "ks2", "o1"), "5");
  assert.deepEqual(parseRef(bdocRef({ type: "ks2", objectId: "abc", number: "12" })), { type: "ks2", objectId: "abc", number: "12" });
  assert.equal(parseRef("sale:1"), null);
  const s = sampleObject("2026-11-24");
  assert.deepEqual(validateObject(s), []);
  assert.equal(estimateTotals(s).works, 560000);
});

test("демо-объект: документы в прошлом месяце, проводки сходятся, анализ считается", () => {
  const o = sampleObject("2026-11-24");
  const docs = sampleDocs(o);
  assert.ok(docs.every((d) => d.date.startsWith("2026-10")));
  for (const d of docs) assert.deepEqual(validateEntry({ date: d.date, lines: bdocLines(d, o) }), [], `${d.type} ${d.number}`);
  const a = analyze(o, docs);
  assert.equal(a.stages[0].progress, 100);
  assert.equal(a.stages[1].progress, 50);
  assert.ok(a.materials.find((m) => m.name === "Плита OSB 12 мм")!.qtyVariance === 5);
  assert.ok(a.grossProfit > 0 && a.wip > 0);
});

test("печатные формы: КС-2, КС-3, акт, договор, расход материалов, отчёт — суммы и реквизиты", async () => {
  const { printKs2, printKs3, printAct, printContract, printMaterials, printReport, printWriteoff } = await import("./print");
  const c = { companyName: "ИП Батырова О. М.", inn: "11111111111111", city: "Бишкек", director: "Батырова О. М.", directorTitle: "Индивидуальный предприниматель", chief: "", vatPayer: false };
  const o = { ...obj(), contractNo: "1", contractDate: "2026-10-18" };
  const act: BuildDoc = { type: "ks2", objectId: "o1", number: "1", date: "2026-10-30", from: "2026-10-18", to: "2026-10-30", rows: [{ workId: "w1", code: "1.1", name: "Обшивка стен", unit: "м2", qty: 32, price: 15625 }, { workId: "w2", name: "Укладка плитки", unit: "м", qty: 8, price: 7500 }] };
  const w = wo("1", "2026-10-20", [{ name: "Плита OSB", unit: "лист", qty: 60, price: 1450, stageId: "s1", account: "1620" }]);
  const text = (b: unknown[]) => JSON.stringify(b);
  const ks2 = text(printKs2(c, o, act));
  assert.match(ks2, /Акт приёмки выполненных работ/);
  assert.match(ks2, /Не унифицированная форма/);
  assert.match(ks2, /560 000,00/);
  assert.match(ks2, /627 200,00/); // с НДС 12 %
  assert.match(ks2, /Шестьсот двадцать семь тысяч двести сомов/);
  assert.match(text(printKs3(c, o, act, [w, act])), /Справка о стоимости выполненных работ и затрат/);
  const a = text(printAct(c, o, act, [w, act]));
  assert.match(a, /договора подряда № 1 от 18\.10\.2026/);
  assert.match(a, /материалы Подрядчика на сумму 87 000,00/);
  assert.match(a, /Гарантийное удержание 5 %/);
  const k = text(printContract(c, o));
  assert.match(k, /ДОГОВОР ПОДРЯДА № 1/);
  assert.match(k, /627 200,00/);
  assert.match(text(printMaterials(c, o, [w, act], undefined, "2026-10-31")), /Плита OSB.*60.*60/);
  assert.match(text(printReport(c, o, [w, act], "2026-10-31")), /ОТЧЁТ ПО ОБЪЕКТУ/);
  assert.match(text(printWriteoff(c, o, w)), /87 000,00/);
});

test("отклонения: материалы — цена и количество, труд — ставка и выработка, вне сметы; этап в работе — только цена", () => {
  const o = obj();
  const docs: BuildDoc[] = [
    wo("1", "2026-10-20", [{ name: "Плита OSB", unit: "лист", qty: 66, price: 1450, stageId: "s1", account: "1620" }, { name: "Саморезы", unit: "кг", qty: 2, price: 300, stageId: "s1", account: "1620" }]),
    wo("2", "2026-10-21", [{ name: "Плитка", unit: "м2", qty: 4, price: 1100, stageId: "s2", account: "1620" }]),
    { type: "cost", objectId: "o1", number: "1", date: "2026-10-25", pay: "reclass", reclass: "7120", rows: [{ name: "Бригада", unit: "чел.-дн", qty: 44, price: 2400, costType: "labor", stageId: "s1" }] },
    { type: "ks2", objectId: "o1", number: "1", date: "2026-10-30", rows: [{ workId: "w1", name: "Обшивка стен", unit: "м2", qty: 32, price: 15625 }] },
  ];
  const v = analyze(o, docs).variances;
  const osb = v.rows.find((r) => r.name === "Плита OSB")!;
  assert.deepEqual([osb.priceVar, osb.usageVar, osb.done], [-3300, 9000, true]);
  const lab = v.rows.find((r) => r.type === "labor")!;
  assert.deepEqual([lab.priceVar, lab.usageVar], [-4400, 10000]);
  const tile = v.rows.find((r) => r.name === "Плитка")!;
  assert.deepEqual([tile.priceVar, tile.usageVar, tile.done], [400, null, false]);
  assert.equal(v.rows.find((r) => r.name === "Саморезы")!.outside, 600);
  assert.deepEqual([v.price, v.usage, v.outside, v.doneTotal], [-7300, 19000, 600, 11900]);
  assert.match(v.summary!, /из-за цен −7 300 сом, из-за количества \(по сданным этапам\) \+19 000 сом, затраты вне сметы \+600 сом/);
  // разные единицы у плана и факта: только общее отклонение сданного этапа
  const v2 = analyze(o, [{ ...docs[2], rows: [{ ...docs[2].rows[0], unit: "мес", qty: 1, price: 105600 }] }, docs[3]]).variances.rows.find((r) => r.type === "labor")!;
  assert.deepEqual([v2.priceVar, v2.usageVar], [null, 5600]);
});
