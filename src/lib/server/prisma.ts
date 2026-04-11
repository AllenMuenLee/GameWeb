import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  __gameWebPrisma?: PrismaClient;
};

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export const prisma =
  globalForPrisma.__gameWebPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__gameWebPrisma = prisma;
}
