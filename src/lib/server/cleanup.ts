import "server-only";

import { asc, eq, inArray, lte } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { artifacts, batches } from "@/db/schema";
import { deleteArtifacts } from "@/lib/server/storage";

const STORAGE_DELETE_CHUNK = 100;

async function removeStoragePaths(paths: string[]) {
  for (let index = 0; index < paths.length; index += STORAGE_DELETE_CHUNK) {
    await deleteArtifacts(paths.slice(index, index + STORAGE_DELETE_CHUNK));
  }
}

/**
 * Removes expired uploaded files before pruning expired structured results.
 * Each phase is bounded so a large inactive project cannot monopolize a worker.
 */
export async function cleanupExpiredProofCheckData(now = new Date()) {
  const db = getDatabase();
  const expiredArtifacts = await db
    .select({ id: artifacts.id, storagePath: artifacts.storagePath })
    .from(artifacts)
    .where(lte(artifacts.expiresAt, now))
    .orderBy(asc(artifacts.expiresAt))
    .limit(STORAGE_DELETE_CHUNK);

  if (expiredArtifacts.length) {
    await removeStoragePaths(expiredArtifacts.map((item) => item.storagePath));
    await db.delete(artifacts).where(
      inArray(
        artifacts.id,
        expiredArtifacts.map((item) => item.id),
      ),
    );
  }

  const expiredBatches = await db
    .select({ id: batches.id })
    .from(batches)
    .where(lte(batches.expiresAt, now))
    .orderBy(asc(batches.expiresAt))
    .limit(25);

  let deletedBatches = 0;
  for (const batch of expiredBatches) {
    const paths = await db
      .select({ storagePath: artifacts.storagePath })
      .from(artifacts)
      .where(eq(artifacts.batchId, batch.id));
    await removeStoragePaths(paths.map((item) => item.storagePath));
    const deleted = await db
      .delete(batches)
      .where(eq(batches.id, batch.id))
      .returning({ id: batches.id });
    deletedBatches += deleted.length;
  }

  return {
    deletedArtifacts: expiredArtifacts.length,
    deletedBatches,
  };
}
