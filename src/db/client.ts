import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("The server database is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new DatabaseConfigurationError();
  }
  return value;
}

type SqlClient = ReturnType<typeof postgres>;

const globalForDatabase = globalThis as typeof globalThis & {
  proofcheckSql?: SqlClient;
  proofcheckDb?: ReturnType<typeof createDatabase>;
};

function createSqlClient(): SqlClient {
  return postgres(databaseUrl(), {
    connect_timeout: 10,
    idle_timeout: 20,
    max: process.env.VERCEL ? 1 : 5,
    prepare: false,
  });
}

function createDatabase(sqlClient: SqlClient) {
  return drizzle(sqlClient, { schema });
}

export function getSqlClient(): SqlClient {
  if (!globalForDatabase.proofcheckSql) {
    globalForDatabase.proofcheckSql = createSqlClient();
  }
  return globalForDatabase.proofcheckSql;
}

export function getDatabase() {
  if (!globalForDatabase.proofcheckDb) {
    globalForDatabase.proofcheckDb = createDatabase(getSqlClient());
  }
  return globalForDatabase.proofcheckDb;
}

export type Database = ReturnType<typeof getDatabase>;

export async function closeDatabaseConnection(): Promise<void> {
  if (globalForDatabase.proofcheckSql) {
    await globalForDatabase.proofcheckSql.end({ timeout: 5 });
    delete globalForDatabase.proofcheckSql;
    delete globalForDatabase.proofcheckDb;
  }
}
