import { PrismaClient } from "@prisma/client";

// Created on first use, not on import: pages and exports for the demo
// company import modules that reference `prisma` but never query it, and
// they must work without a database (and without starting an engine).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = process.env.FL_TEST_PG_URL ? testClient(process.env.FL_TEST_PG_URL) : new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
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
  const { PrismaClient: WasmClient } = req(".prisma/client/wasm.js");
  return new WasmClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = (c as any)[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});
