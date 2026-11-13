// «Дымовая» проверка: создать копию демо-компании и открыть каждый раздел меню в браузере.
// Падает, если страница отвечает 5xx, показывает экран ошибки или в консоли есть ошибки скриптов.
// Запуск: node scripts/smoke.mjs http://localhost:3000
import { readFileSync } from "node:fs";
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const nav = readFileSync(new URL("../lib/nav.ts", import.meta.url), "utf8");
const pages = [...new Set([...nav.matchAll(/href:\s*"(\/[^"]*)"/g)].map((m) => m[1]))];
for (const extra of ["/", "/news", "/law", "/pricing", "/login"]) if (!pages.includes(extra)) pages.push(extra);

const res = await fetch(`${BASE}/api/demo`, { method: "POST", headers: { Origin: BASE } });
if (!res.ok) { console.error("Не удалось создать демо-компанию:", res.status, await res.text()); process.exit(1); }
const { id: companyId } = await res.json();
console.log(`Демо-компания ${companyId}, страниц: ${pages.length}`);

const browser = await chromium.launch();
const problems = [];
async function visit(path, mobile) {
  const ctx = await browser.newContext(mobile ? devices["iPhone 13"] : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((cid) => { try { localStorage.setItem("finlite:companyId", cid); } catch {} }, companyId);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errs.push(`console: ${m.text().slice(0, 300)}`); });
  let status = 0;
  try {
    const r = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
    status = r?.status() ?? 0;
    await page.waitForTimeout(800);
    const crash = await page.getByText(/Страница не открылась|FinLite KG не открылся|This page couldn.t load|Application error/).count();
    if (crash) errs.push("на странице экран ошибки");
  } catch (e) { errs.push(`не загрузилась: ${e.message.split("\n")[0]}`); }
  if (status >= 500) errs.push(`HTTP ${status}`);
  const tag = `${mobile ? "📱 " : ""}${path}`;
  if (errs.length) { problems.push({ tag, errs }); console.log(`✗ ${tag}\n   ${errs.join("\n   ")}`); } else console.log(`✓ ${tag}`);
  await ctx.close();
}
for (const p of pages) await visit(p, false);
for (const p of ["/", "/ledger?new=1", "/reports"]) await visit(p, true);
await browser.close();
if (problems.length) { console.error(`\nОшибки на ${problems.length} страницах.`); process.exit(1); }
console.log("\nВсе страницы открываются без ошибок.");
