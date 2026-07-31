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
  throw new Error("DATABASE_URL is required to verify the database.");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const expectedTables = [
  "applications",
  "artifacts",
  "batches",
  "extractions",
  "label_jobs",
  "queue_outbox",
  "review_decisions",
  "rule_results",
  "status_events",
  "usage_ledger",
];

try {
  const rows = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${expectedTables})
    ORDER BY tablename
  `;
  const found = new Set(rows.map((row) => row.tablename));
  const missing = expectedTables.filter((name) => !found.has(name));
  if (missing.length)
    throw new Error(`Missing database objects: ${missing.join(", ")}`);

  const bucketRows = await sql`
    SELECT public FROM storage.buckets WHERE id = 'label-artifacts'
  `;
  if (bucketRows.length !== 1 || bucketRows[0].public !== false) {
    throw new Error("The private label-artifacts bucket is not configured.");
  }

  console.log("ProofCheck database and private storage bucket verified.");
} finally {
  await sql.end({ timeout: 5 });
}
