import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { applications, artifacts, batches } from "@/db/schema";
import {
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal/errors";

export async function registerArtifactForSession(input: {
  applicationId: string;
  batchId: string;
  height?: number;
  mimeType: string;
  panelType?: (typeof artifacts.$inferInsert)["panelType"];
  purpose: (typeof artifacts.$inferInsert)["purpose"];
  sessionId: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
  width?: number;
}) {
  return getDatabase().transaction(async (transaction) => {
    const ownership = await transaction.execute(sql`
      SELECT b.status
      FROM applications a
      INNER JOIN batches b ON b.id = a.batch_id
      WHERE a.id = ${input.applicationId}
        AND a.batch_id = ${input.batchId}
        AND b.session_id = ${input.sessionId}
      FOR UPDATE OF a
    `);
    const record = ownership[0] as { status: string } | undefined;
    if (!record) throw new RecordNotFoundError();
    if (record.status !== "draft") throw new InvalidRecordStateError();

    const duplicateCondition = and(
      eq(artifacts.applicationId, input.applicationId),
      eq(artifacts.sha256, input.sha256),
      input.panelType
        ? eq(artifacts.panelType, input.panelType)
        : sql`${artifacts.panelType} is null`,
    );
    const [duplicate] = await transaction
      .select()
      .from(artifacts)
      .where(duplicateCondition)
      .limit(1);
    if (duplicate) return duplicate;

    const [artifact] = await transaction
      .insert(artifacts)
      .values({
        applicationId: input.applicationId,
        batchId: input.batchId,
        height: input.height,
        mimeType: input.mimeType,
        panelType: input.panelType,
        purpose: input.purpose,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        storagePath: input.storagePath,
        width: input.width,
      })
      .returning();
    return artifact;
  });
}

export async function listArtifactsForApplicationSession(
  applicationId: string,
  sessionId: string,
) {
  return getDatabase()
    .select({ artifact: artifacts })
    .from(artifacts)
    .innerJoin(applications, eq(artifacts.applicationId, applications.id))
    .innerJoin(batches, eq(applications.batchId, batches.id))
    .where(
      and(eq(applications.id, applicationId), eq(batches.sessionId, sessionId)),
    )
    .orderBy(asc(artifacts.createdAt));
}

export async function listArtifactPathsForBatchSession(
  batchId: string,
  sessionId: string,
) {
  return getDatabase()
    .select({ storagePath: artifacts.storagePath })
    .from(artifacts)
    .innerJoin(batches, eq(artifacts.batchId, batches.id))
    .where(and(eq(batches.id, batchId), eq(batches.sessionId, sessionId)))
    .orderBy(asc(artifacts.createdAt));
}
