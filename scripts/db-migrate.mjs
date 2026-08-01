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

// During the latency-program rollout, 0001 was applied to the prototype
// database before its final whitespace-only repository normalization. Keep the
// reconciliation exact and one-directional: every other checksum mismatch
// remains a hard failure, while this known pre-release checksum is advanced to
// the committed checksum once.
const knownChecksumReconciliations = new Map([
  [
    "0001_processing_attempts.sql",
    new Map([
      [
        "b9de0f062ad7c66aeec31332d8cf34eaf5de7f085dfbbcfe343ca0b3de0e9637",
        "d148f42cc7a0feca0d60d2dacfae5dc76d6dd9799efc2e7a5ce4149e347dec62",
      ],
    ]),
  ],
]);

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
          const expectedCurrent = knownChecksumReconciliations
            .get(name)
            ?.get(existing.checksum);
          if (expectedCurrent !== checksum) {
            throw new Error(`Applied migration ${name} has changed.`);
          }
          await transaction`
            UPDATE proofcheck_migrations
            SET checksum = ${checksum}
            WHERE name = ${name} AND checksum = ${existing.checksum}
          `;
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
