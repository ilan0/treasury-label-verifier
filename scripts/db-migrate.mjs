import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const migrationDirectory = path.resolve("drizzle");
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice(notice) {
    // PostgreSQL reports the expected second-run IF NOT EXISTS path as a
    // NOTICE. Keep genuinely unexpected server notices visible.
    if (notice.code !== "42P07") console.warn(notice.message);
  },
});

try {
  await sql`
    CREATE TABLE IF NOT EXISTS proofcheck_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE proofcheck_migrations FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE proofcheck_migrations FROM authenticated;
      END IF;
    END;
    $$;
  `);

  for (const name of migrationFiles) {
    const contents = await readFile(
      path.join(migrationDirectory, name),
      "utf8",
    );
    const checksum = createHash("sha256").update(contents).digest("hex");

    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext('proofcheck-migrations'))`;
      const [existing] = await transaction`
        SELECT checksum FROM proofcheck_migrations WHERE name = ${name}
      `;

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`Applied migration ${name} has changed.`);
        }
        return;
      }

      await transaction.unsafe(contents);
      await transaction`
        INSERT INTO proofcheck_migrations (name, checksum)
        VALUES (${name}, ${checksum})
      `;
    });

    console.log(`Migration ready: ${name}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
