import { PrismaClient } from "@prisma/client";

// Created on first use, not on import: pages and exports for the demo
// company import modules that reference `prisma` but never query it, and
// they must work without a database (and without starting an engine).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = (c as any)[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});
