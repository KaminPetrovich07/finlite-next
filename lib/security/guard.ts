// Типичные адреса, которые перебирают сканеры уязвимостей: отвечаем 404 сразу, без рендера.
export const PROBE = /(^|\/)(\.env|\.git|\.aws|\.ssh|wp-admin|wp-login|wp-content|xmlrpc|phpmyadmin|cgi-bin|vendor\/phpunit)|\.(php|asp|aspx|jsp|cgi)$/i;

// Общий потолок запросов к API с одного IP (в памяти экземпляра сервера — грубая защита
// от перебора и «долбёжки»; точные лимиты на вход, регистрацию и публикации — в самих API).
const API_MAX = 240, WRITE_MAX = 60, WINDOW_MS = 60_000;
const hits = new Map<string, { t: number; all: number; write: number }>();
export function overLimit(ip: string, write: boolean, now = Date.now()): boolean {
  let h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) { h = { t: now, all: 0, write: 0 }; hits.set(ip, h); }
  h.all++; if (write) h.write++;
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.t > WINDOW_MS) hits.delete(k);
  return h.all > API_MAX || h.write > WRITE_MAX;
}
