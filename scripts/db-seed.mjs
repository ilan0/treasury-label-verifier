import process from "node:process";

import postgres from "postgres";

if (!process.env.DATABASE_URL && process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl)
  throw new Error("DATABASE_URL is required to verify demo readiness.");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const [schema] = await sql`
    SELECT to_regclass('public.batches') IS NOT NULL AS ready
  `;
  if (!schema?.ready) {
    throw new Error(
      "Run the database migrations before verifying demo readiness.",
    );
  }

  // Built-in examples are immutable, version-controlled fixtures. `/api/demo`
  // materializes them inside the requesting user's isolated session.
  console.log(
    "Demo fixtures are bundled and ready for session-scoped materialization.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
