// Ошибки при отрисовке страниц и в серверных функциях Next.js — в журнал ошибок.
// (Ошибки API, пойманные обёрткой route(), записываются там же.)
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // без импорта lib/monitor/errors: этот файл входит в каждую серверную функцию Vercel,
  // и импорт тянул бы туда Prisma со всеми движками (Functions Storage растёт с каждым деплоем)
  const recordError = (globalThis as { __flRecordError?: (e: Record<string, unknown>) => Promise<void> }).__flRecordError;
  if (!recordError) { console.error("[FinLite] ошибка на сервере:", err); return; }
  const e = err as Error & { digest?: string };
  const ua = request.headers["user-agent"];
  await recordError({
    source: "server",
    message: `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`,
    stack: e?.stack ?? null,
    url: `${request.path}${context.routePath && context.routePath !== request.path ? ` (${context.routePath})` : ""}`,
    digest: e?.digest ?? null,
    userAgent: Array.isArray(ua) ? ua[0] : ua ?? null,
  });
}
