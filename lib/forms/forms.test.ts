import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMS, FORM_BY_ID } from "./index";
import { buildForm, headRows } from "./render";
import { placeHeads, type DocBlock } from "@/lib/docs/model";
import { renderOfficialDocx } from "@/lib/docs/render-docx";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";

test("каталог покрывает все 132 позиции содержания альбома", () => {
  const ids = new Set<string>();
  for (const f of FORMS) { assert.ok(!ids.has(f.id), `повтор ${f.id}`); ids.add(f.id); }
  const nums = new Set(FORMS.map((f) => f.n));
  for (let i = 1; i <= 132; i++) assert.ok(nums.has(String(i)), `нет формы № ${i}`);
  assert.ok(nums.has("16-а"));
  assert.equal(FORMS.filter((f) => f.unified).length, 93);
});

test("многоуровневые шапки ровно покрывают все графы", () => {
  for (const f of FORMS) for (const p of f.parts) {
    if (p.t !== "table") continue;
    const heads = headRows(p.cols);
    const grid = heads.map(() => Array(p.cols.length).fill(0));
    placeHeads(heads, p.cols.length).forEach((row, r) => row.forEach(({ cell, col }) => {
      for (let rr = r; rr < r + (cell.rowSpan ?? 1); rr++) for (let cc = col; cc < col + (cell.colSpan ?? 1); cc++) grid[rr][cc]++;
    }));
    for (const row of grid) assert.ok(row.every((x) => x === 1), `${f.id}/${p.id}: шапка не совпадает с графами`);
  }
});

test("группа «Дебет|счёт» + «Дебет|код» объединяется, графа без группы занимает обе строки", () => {
  const h = headRows([{ h: "Дата" }, { h: "Дебет|счёт" }, { h: "Дебет|код" }]);
  assert.deepEqual(h, [[{ text: "Дата", rowSpan: 2 }, { text: "Дебет", colSpan: 2 }], [{ text: "счёт", rowSpan: undefined }, { text: "код", rowSpan: undefined }]]);
});

test("итоги считаются по графам с суммой, реквизиты подставляются, чистый бланк их не берёт", () => {
  const def = FORM_BY_ID["t-53"];
  const fills = { org: "ОсОО «Тест»", inn: "123", director: "Асанов А. А.", chief: "Бекова Б. Б.", cashier: "Касымова К. К." };
  const values = { t: { t: [["1", "7", "Иванов И. И.", "10 000,50", "", ""], ["2", "8", "Петров П. П.", "2 000", "", ""]] } };
  const doc = buildForm(def, values, fills);
  const tables = doc.blocks.filter((b): b is Extract<DocBlock, { t: "table" }> => b.t === "table");
  const last = tables[0].rows.at(-1)!;
  assert.equal(last[0], "Итого");
  assert.equal(last[3], "12 000,50");
  const text = JSON.stringify(doc.blocks);
  assert.ok(text.includes("Касымова К. К.") && text.includes("ОсОО «Тест»"));
  const blank = JSON.stringify(buildForm(def, values, fills, true).blocks);
  assert.ok(!blank.includes("Иванов") && !blank.includes("Касымова"));
});

test("все бланки собираются в Word, часть — в PDF", async () => {
  for (const f of FORMS) {
    const buf = await renderOfficialDocx(buildForm(f, {}, { org: "ОсОО «Белес»" }));
    assert.ok(buf.length > 3000, f.id);
  }
  for (const id of ["ko-3", "os-1", "inv-8a", "t-12", "mx-11", "ip-payroll"]) {
    const pdf = await renderOfficialPdf(buildForm(FORM_BY_ID[id], {}, {}, true));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF", id);
  }
});
