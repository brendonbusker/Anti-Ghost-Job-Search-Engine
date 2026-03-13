import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/anti_ghost_jobs?schema=public";

  const adapter = new PrismaPg(createPoolConfig(connectionString));

  return new PrismaClient({
    adapter,
  });
}

function createPoolConfig(connectionString: string): pg.PoolConfig {
  const parsedConnectionString = new URL(connectionString);
  const connectionLimit = readPoolMax(
    parsedConnectionString.searchParams.get("connection_limit"),
    process.env.ANTI_GHOST_DB_POOL_MAX,
  );

  // `connection_limit` is a Prisma-style URL flag; strip it before handing the URL to node-postgres.
  parsedConnectionString.searchParams.delete("connection_limit");

  return {
    connectionString: parsedConnectionString.toString(),
    max: connectionLimit,
    allowExitOnIdle: true,
  };
}

function readPoolMax(...candidates: Array<string | undefined | null>): number | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const parsed = Number(candidate);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
