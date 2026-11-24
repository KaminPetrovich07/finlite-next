// Печатные формы на кыргызском: сумма прописью, дата, накладная и приходный ордер целиком.
import { test } from "node:test";
import assert from "node:assert/strict";
import { docToKyrgyz, sumInWordsKy, dateLongKy } from "./docs-ky";
import { buildEntryDoc, type PrimaryCtx } from "@/lib/primary/build";
import { docLines, type TradeDoc } from "@/lib/trade/doc";
import type { LedgerEntry } from "@/lib/ledger/types";

test("сумма прописью и дата по-кыргызски", () => {
  assert.equal(sumInWordsKy(8330), "Сегиз миң үч жүз отуз сом 00 тыйын");
  assert.equal(sumInWordsKy(1_250_000.5), "Бир миллион эки жүз элүү миң сом 50 тыйын");
  assert.equal(sumInWordsKy(19.07), "Он тогуз сом 07 тыйын");
  assert.equal(sumInWordsKy(0.4), "Нөл сом 40 тыйын");
  assert.equal(dateLongKy(15, 11, 2026), "2026-ж. 15-ноябрь");
});

const ctx = (e: LedgerEntry): PrimaryCtx => ({ companyName: "ОсОО «Ала-Тоо Трейд»", inn: "02507201910123", people: { director: "Асанов А.", directorTitle: "Директор", chief: "Токтогулова Г.", cashier: "", storekeeper: "" }, policy: null, entries: [e] });

const russianLeft = (blocks: ReturnType<typeof docToKyrgyz>["blocks"]) => {
  const texts: string[] = [];
  for (const b of blocks) {
    if ("text" in b && b.text) texts.push(b.text);
    if (b.t === "table") { texts.push(...(b.head ?? []), ...(b.heads ?? []).flat().map((c) => c.text)); for (const r of b.rows) if (!r[0]) texts.push(r[1] ?? ""); }
    if (b.t === "sign") texts.push(...b.items.map((x) => x.role));
    if (b.t === "fields") texts.push(...b.items.map(([k]) => k));
    if (b.t === "right") texts.push(...b.lines);
    if (b.t === "formHead") texts.push(...b.corner);
    if (b.t === "box") texts.push(...b.heads);
  }
  // русские служебные слова и подписи (названия товаров и организаций — данные пользователя, их не переводим)
  return texts.filter((t) => /(?:^|\s)(и|или|от|на|по|без|всего|итого|сумма|цена|принял|сдал|счёт|счет)(?:\s|$|[.,:(])/i.test(t.replace(/«[^»]*»/g, "")));
};

test("накладная и счёт с НДС — целиком на кыргызском, сумма прописью из итога", () => {
  const doc: TradeDoc = { type: "sale", number: "15", date: "2026-11-15", party: "ОсОО «Бишкек Маркет»", payment: "credit", vatIncluded: true,
    rows: [{ name: "Чай зелёный", unit: "шт", kind: "goods", qty: 20, price: 185.5, vat: "12" }, { name: "Доставка", unit: "усл. ед", kind: "service", qty: 1, price: 300, vat: "none" }] };
  const e: LedgerEntry = { id: "e1", date: doc.date, description: "Реализация № 15", source: "trade", sourceRef: "sale:15", lines: docLines(doc) };
  for (const kind of ["waybill", "invoice"] as const) {
    const ky = docToKyrgyz({ title: "x", fileName: "x", blocks: buildEntryDoc(kind, e, 15, ctx(e)) });
    assert.equal(ky.lang, "ky");
    const title = ky.blocks.find((b) => b.t === "formTitle");
    assert.ok(title && title.t === "formTitle" && title.no === "15" && !/Накладная|Счёт/.test(title.text), `заголовок: ${JSON.stringify(title)}`);
    const words = ky.blocks.find((b) => b.t === "p" && b.text.startsWith("Бардыгы"));
    assert.ok(words && "text" in words, "сумма прописью");
    assert.equal((words as { text: string }).text, "Бардыгы төрт миң он сом 00 тыйын, анын ичинде КНС 397,50 сом.");
    assert.deepEqual(russianLeft(ky.blocks), [], "русские слова остались");
    assert.equal(title.date, "15.11.2026", "дата в заголовке");
  }
});

test("приходный ордер М-4 на кыргызском", () => {
  const doc: TradeDoc = { type: "purchase", number: "А-7", date: "2026-11-10", party: "ОсОО «Опт»", payment: "credit", vatIncluded: false,
    rows: [{ name: "Чай зелёный", unit: "шт", kind: "goods", qty: 100, price: 80, vat: "12" }] };
  const e: LedgerEntry = { id: "e2", date: doc.date, description: "Поступление № А-7", source: "trade", sourceRef: "purchase:А-7", lines: docLines(doc) };
  const ky = docToKyrgyz({ title: "x", fileName: "x", blocks: buildEntryDoc("m4", e, 3, ctx(e)) });
  assert.ok(ky.blocks.some((b) => b.t === "formTitle" && b.text === "Кирүү ордери" && b.no === "3"));
  assert.ok(ky.blocks.some((b) => b.t === "formHead" && b.corner.includes("№ М-4 форма")));
  // графы бланка альбома — тоже по-кыргызски
  assert.ok(ky.blocks.some((b) => b.t === "table" && b.heads?.some((r) => r.some((c) => c.text === "Материалдык баалуулуктар"))));
  assert.deepEqual(russianLeft(ky.blocks), []);
});
