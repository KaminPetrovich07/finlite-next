// Ошибки при отрисовке страниц и в серверных функциях Next.js — в журнал ошибок.
// (Ошибки API, пойманные обёрткой route(), записываются там же.)
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/monitor/errors");
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
