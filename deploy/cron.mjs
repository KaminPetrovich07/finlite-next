// ════════════════════════════════════════════════════════════════════════
// deploy/cron.mjs — плановые задачи для собственного сервера (на Vercel их
// запускает Vercel Cron по vercel.json). Раз в минуту сверяет время и вызывает
// задачу приложения с секретом CRON_SECRET; каждая задача — раз в сутки.
//   /api/cron/daily — 09:17 по Бишкеку: курсы НБКР, напоминания о сроках,
//                     новости, повторяющиеся операции, очистка служебного
//   /api/cron/law   — 03:43 по Бишкеку: проверка новых редакций законов
// ════════════════════════════════════════════════════════════════════════

const APP = process.env.FL_APP_URL || "http://app:3000";
const SECRET = process.env.CRON_SECRET;
const JOBS = [
  { path: "/api/cron/daily", utc: "03:17" },
  { path: "/api/cron/law", utc: "21:43" },
];
if (!SECRET) { console.error("cron: CRON_SECRET не задан — задачи не запускаются"); process.exit(1); }

const done = new Map(); // path → дата последнего запуска (UTC)
async function run(job) {
  const t = Date.now();
  try {
    const r = await fetch(APP + job.path, { headers: { authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(300_000) });
    const body = (await r.text()).slice(0, 400);
    console.log(`${new Date().toISOString()} ${job.path} → ${r.status} за ${Math.round((Date.now() - t) / 1000)} с ${body}`);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${job.path} → ошибка: ${e instanceof Error ? e.message : e}`);
  }
}
function tick() {
  const now = new Date();
  const hhmm = now.toISOString().slice(11, 16), day = now.toISOString().slice(0, 10);
  for (const job of JOBS) if (job.utc === hhmm && done.get(job.path) !== day) { done.set(job.path, day); run(job); }
}
// FL_CRON_NOW=1 — запустить все задачи сразу (проверка после установки)
if (process.env.FL_CRON_NOW === "1") JOBS.forEach(run);
console.log(`cron: задачи ${JOBS.map((j) => `${j.path} в ${j.utc} UTC`).join(", ")}; приложение ${APP}`);
setInterval(tick, 20_000);
