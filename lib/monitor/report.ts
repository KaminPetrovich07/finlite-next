// Браузер: отправить ошибку в журнал сайта. Одну и ту же — один раз за загрузку страницы, всего не больше 10.
const sent = new Set<string>();
export function reportError(e: unknown, extra: { digest?: string } = {}) {
  try {
    const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e)?.slice(0, 500) ?? "Неизвестная ошибка");
    const key = `${err.name}:${err.message}`;
    if (sent.has(key) || sent.size >= 10) return;
    sent.add(key);
    const body = JSON.stringify({ message: `${err.name}: ${err.message}`, stack: err.stack?.slice(0, 8000), url: location.href, digest: extra.digest });
    fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch { /* ничего */ }
}
