import { PrismaClient } from "@prisma/client";
import { dbContext, withJournalGuard } from "@/lib/ledger/guard";

// Created on first use, not on import: pages and exports for the demo
// company import modules that reference `prisma` but never query it, and
// they must work without a database (and without starting an engine).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // every write to the journal passes the period lock and is written to its history (lib/ledger/guard.ts)
    globalForPrisma.prisma = withJournalGuard(process.env.FL_TEST_PG_URL ? testClient(process.env.FL_TEST_PG_URL) : new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }));
  }
  return globalForPrisma.prisma;
}

/**
 * Local integration tests only (FL_TEST_PG_URL set): Prisma's bundled WASM
 * engine + the node-postgres driver, so tests run where the native engine
 * cannot be downloaded. Never used in production. Loaded via an indirect
 * require so the bundler does not pull `pg` into the app.
 */
function testClient(url: string): PrismaClient {
  const req = eval("require") as NodeRequire;
  const { Pool } = req("pg");
  const { PrismaPg } = req("@prisma/adapter-pg");
  // Node cannot import the engine's .wasm file by itself (bundlers can): hand it over as a WebAssembly.Module
  try {
    req("node:module").register("data:text/javascript," + encodeURIComponent(
      "export async function load(url, ctx, next) {" +
      " if (/\\.wasm(\\?|$)/.test(url)) { const u = new URL(url); u.search = '';" +
      "  return { format: 'module', shortCircuit: true, source: 'import { readFileSync } from \"node:fs\"; export default new WebAssembly.Module(readFileSync(new URL(' + JSON.stringify(u.href) + ')));' }; }" +
      " return next(url, ctx); }"));
  } catch { /* older Node or a bundler that already handles .wasm */ }
  const { PrismaClient: WasmClient } = req(".prisma/client/wasm.js");
  return new WasmClient({ adapter: new PrismaPg(new Pool({ connectionString: url, max: Number(process.env.FL_TEST_PG_POOL) || 10 })) });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    // interactive transactions: the callback runs with its tx client in dbContext, so the journal
    // guard reads and writes through the same transaction (and the same connection)
    if (prop === "$transaction") {
      return (arg: unknown, opts?: unknown) => typeof arg === "function"
        ? (c as any).$transaction((tx: unknown) => dbContext.run({ ...dbContext.getStore(), tx }, () => (arg as (t: unknown) => unknown)(tx)), opts)
        : (c as any).$transaction(arg, opts);
    }
    const value = (c as any)[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});
