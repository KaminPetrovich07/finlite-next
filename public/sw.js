// FinLite KG — service worker. Only one job: when there is no connection, show a clear
// «нет связи» page instead of the browser's error. Nothing is cached: financial data and
// pages always come fresh from the server.
const OFFLINE = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Нет связи — FinLite KG</title>
<body style="font:16px/1.5 system-ui,sans-serif;background:#F5F6F8;color:#12151C;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px">
<main style="max-width:420px;text-align:center"><h1 style="font-size:22px">Нет связи с интернетом</h1>
<p>FinLite KG работает онлайн: данные хранятся на сервере и не теряются. Проверьте подключение — страница откроется сама.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:10px 18px;border:0;border-radius:8px;background:#F2B705;font-weight:600">Повторить</button></main>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
