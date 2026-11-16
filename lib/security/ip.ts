// ════════════════════════════════════════════════════════════════════════
// lib/security/ip.ts — адрес клиента для лимитов и журнала входов.
//
// Заголовки X-Forwarded-For / X-Real-IP может прислать кто угодно, поэтому
// верим им только там, где их гарантированно перезаписывает свой прокси:
//   • Vercel (VERCEL=1) — платформа сама ставит X-Real-IP с адресом клиента;
//   • свой сервер — FL_TRUSTED_PROXIES=N: за приложением стоят N своих
//     прокси (nginx, Caddy), каждый дописывает адрес в конец X-Forwarded-For.
//     Берём N-й адрес с конца: его записал наш прокси, подделать нельзя.
//   • без прокси (N=0) — последний адрес в X-Forwarded-For: если клиент
//     заголовок не прислал, Next.js ставит туда адрес сокета.
// Чистая функция: заголовки и окружение передаются аргументами.
// ════════════════════════════════════════════════════════════════════════

type Env = Record<string, string | undefined>;

export function pickClientIp(get: (name: string) => string | null | undefined, env: Env = process.env): string {
  const xff = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (env.VERCEL) return get("x-real-ip")?.trim() || xff[0] || "unknown";
  const hops = Math.max(0, Math.min(10, Math.floor(Number(env.FL_TRUSTED_PROXIES ?? 0)) || 0));
  if (!xff.length) return "unknown";
  return hops > 0 ? xff[Math.max(0, xff.length - hops)] : xff[xff.length - 1];
}
