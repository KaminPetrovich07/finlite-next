// Научная сводка из OpenAlex: разбор ответов, тренды, сборка снимка — на образцах ответов API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTranslations, fetchScope, parseGroups, parseWork, SCOPES, trends, untranslated, windowsFor, type ScienceSnapshot } from "./openalex";

// образец работы в формате OpenAlex (поля, которые запрашиваются через select)
const WORK = {
  id: "https://openalex.org/W2120917837",
  doi: "https://doi.org/10.1016/0304-405x(76)90026-x",
  display_name: "Theory of the firm: Managerial behavior, agency costs and ownership structure",
  publication_year: 1976, cited_by_count: 61234, type: "article",
  open_access: { is_oa: false, oa_url: null },
  primary_location: { landing_page_url: "https://doi.org/10.1016/0304-405x(76)90026-x", source: { id: "https://openalex.org/S149240962", display_name: "Journal of Financial Economics", type: "journal" } },
  authorships: [
    { author: { display_name: "Michael C. Jensen" }, institutions: [{ display_name: "University of Rochester", country_code: "US" }], countries: ["US"] },
    { author: { display_name: "William H. Meckling" }, institutions: [], countries: ["US"] },
  ],
  primary_topic: { display_name: "Corporate Finance and Governance", subfield: { id: "https://openalex.org/subfields/2003", display_name: "Finance" } },
};

test("разбор работы: название, авторы, источник, страны, ссылка", () => {
  const w = parseWork(WORK);
  assert.equal(w.id, "W2120917837");
  assert.equal(w.cited, 61234);
  assert.deepEqual(w.authors, ["Michael C. Jensen", "William H. Meckling"]);
  assert.equal(w.moreAuthors, 0);
  assert.equal(w.source, "Journal of Financial Economics");
  assert.deepEqual(w.countries, ["US"]);
  assert.equal(w.url, "https://doi.org/10.1016/0304-405x(76)90026-x");
  const bare = parseWork({ id: "https://openalex.org/W1", display_name: "<i>Audit</i> quality", authorships: [1, 2, 3, 4, 5].map((i) => ({ author: { display_name: `A${i}` }, institutions: [{ country_code: "kg" }] })) });
  assert.equal(bare.title, "Audit quality");
  assert.equal(bare.moreAuthors, 2);
  assert.deepEqual(bare.countries, ["KG"]);
  assert.equal(bare.url, "https://openalex.org/W1");
});

test("тренды: рост к прошлому окну, отсечение мелких, тема вне 200 крупнейших — «не меньше»", () => {
  const before = [{ key: "T1", name: "ESG reporting", count: 100 }, { key: "T2", name: "Audit fees", count: 400 }];
  const after = [{ key: "T1", name: "ESG reporting", count: 300 }, { key: "T2", name: "Audit fees", count: 420 }, { key: "T3", name: "Tiny", count: 5 }, { key: "T4", name: "Shrinking", count: 50 }];
  before.push({ key: "T4", name: "Shrinking", count: 80 });
  const t = trends(before, after, 10, 10);
  assert.deepEqual(t.map((x) => [x.id, x.growth]), [["T1", 200], ["T2", 5]]);
  const big = Array.from({ length: 200 }, (_, i) => ({ key: `K${i}`, name: `k${i}`, count: 1000 - i }));
  const r = trends(big, [{ key: "NEW", name: "Generative AI in auditing", count: 900 }], 10, 5);
  assert.equal(r[0].approx, true);
  assert.equal(r[0].before, 801);
  assert.equal(parseGroups({ group_by: [{ key: "https://openalex.org/T5", key_display_name: "X", count: 3 }, { key: "unknown", count: 9 }] }).length, 1);
});

test("окна: три последних полных года против трёх предыдущих", () => {
  assert.deepEqual(windowsFor(new Date("2026-11-14T00:00:00Z")), { before: [2020, 2022], after: [2023, 2025], recent: [2021, 2025] });
});

/** A fake OpenAlex: answers by the request's parameters. */
function fakeOpenAlex(calls: string[]) {
  return async (u: string) => {
    calls.push(u);
    const q = new URL(u).searchParams;
    const f = q.get("filter") ?? "", g = q.get("group_by");
    if (new URL(u).pathname === "/sources") return { results: [{ id: "https://openalex.org/S1", display_name: "The Accounting Review", summary_stats: { h_index: 210, "2yr_mean_citedness": 4.123 }, is_oa: false, type: "journal" }] };
    if (g === "publication_year") return { group_by: [2023, 2024, 2025].map((y, i) => ({ key: String(y), key_display_name: String(y), count: 1000 + i * 200 })) };
    if (g === "primary_location.source.id") return { group_by: [{ key: "https://openalex.org/S1", key_display_name: "The Accounting Review", count: 800 }, { key: "https://openalex.org/S2", key_display_name: "Sustainability", count: 500 }] };
    if (g === "primary_topic.id") return { group_by: f.includes("2023-2025") ? [{ key: "https://openalex.org/T1", key_display_name: "Sustainability reporting", count: 9000 }, { key: "https://openalex.org/T2", key_display_name: "Earnings management", count: 6000 }] : [{ key: "https://openalex.org/T1", key_display_name: "Sustainability reporting", count: 3000 }, { key: "https://openalex.org/T2", key_display_name: "Earnings management", count: 6000 }] };
    if (g === "keywords.id") return { group_by: f.includes("2023-2025") ? [{ key: "https://openalex.org/keywords/esg", key_display_name: "ESG", count: 4000 }] : [{ key: "https://openalex.org/keywords/esg", key_display_name: "ESG", count: 1000 }] };
    if (g === "authorships.institutions.country_code") return { group_by: [{ key: "KZ", key_display_name: "Kazakhstan", count: 120 }, { key: "KG", key_display_name: "Kyrgyzstan", count: 25 }] };
    if (q.get("per_page") === "1") return { meta: { count: 512345 }, results: [] };
    return { results: [WORK, { ...WORK, id: "https://openalex.org/W2", display_name: "Аудит в Кыргызстане", cited_by_count: 12 }] };
  };
}

test("сборка области: все разделы снимка за ~13 запросов", async () => {
  const calls: string[] = [];
  const s = await fetchScope(SCOPES[0], fakeOpenAlex(calls), new Date("2026-11-14T00:00:00Z"), "KEY");
  assert.ok(calls.length <= 14, `запросов: ${calls.length}`);
  assert.ok(calls.every((c) => c.startsWith("https://api.openalex.org/") && c.includes("api_key=KEY")));
  assert.ok(calls.some((c) => decodeURIComponent(c).includes("primary_topic.subfield.id:1402")));
  assert.equal(s.totalWorks, 512345);
  assert.equal(s.topCited.length, 2);
  assert.deepEqual(s.byYear.map((x) => x.year), [2023, 2024, 2025]);
  assert.equal(s.journals[0].hIndex, 210);
  assert.equal(s.journals[0].meanCited, 4.12);
  assert.equal(s.journals[1].hIndex, null, "нет сведений о журнале — только число работ");
  assert.equal(s.topics[0].name, "Sustainability reporting");
  assert.equal(s.topics[0].growth, 200);
  assert.equal(s.keywords[0].growth, 300);
  assert.deepEqual(s.centralAsia.byCountry.slice(0, 2).map((x) => [x.code, x.count]), [["KZ", 120], ["KG", 25]]);
});

test("перевод: только непереведённые строки латиницей; переводы ложатся на элементы снимка", async () => {
  const scope = await fetchScope(SCOPES[0], fakeOpenAlex([]), new Date("2026-11-14T00:00:00Z"));
  const snap: ScienceSnapshot = { source: "OpenAlex", updatedAt: "", scopes: [scope], errors: [], translations: { ESG: "ESG" } };
  const todo = untranslated(snap);
  assert.ok(todo.includes(WORK.display_name));
  assert.ok(!todo.includes("Аудит в Кыргызстане"), "русские названия не переводим");
  assert.ok(!todo.includes("ESG"), "уже переведено");
  snap.translations[WORK.display_name] = "Теория фирмы: поведение менеджеров, агентские издержки и структура собственности";
  const t = applyTranslations(snap);
  assert.equal(t.scopes[0].topCited[0].titleRu?.startsWith("Теория фирмы"), true);
});

test("database: снимок сохраняется и читается; при сбое области остаются прежние данные", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { refreshSnapshot, loadSnapshot } = await import("./server");
  const { prisma } = await import("@/lib/db");
  try {
    const first = await refreshSnapshot(fakeOpenAlex([]));
    assert.equal(first.scopes.length, SCOPES.length);
    let n = 0;
    const flaky = async (u: string) => { if (n++ > 14) throw new Error("сбой сети"); return fakeOpenAlex([])(u); };
    const second = await refreshSnapshot(flaky);
    assert.equal(second.scopes.length, SCOPES.length, "вторая область взята из прошлого снимка");
    assert.equal(second.errors.length, 1);
    assert.equal((await loadSnapshot())?.updatedAt, second.updatedAt);
  } finally {
    await prisma.appSetting.deleteMany({ where: { key: "science:snapshot" } });
    await prisma.$disconnect();
  }
});
