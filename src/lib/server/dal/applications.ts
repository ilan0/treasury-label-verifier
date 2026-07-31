import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { applications, batches, type JsonObject } from "@/db/schema";
import {
  ConcurrentModificationError,
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal/errors";

export async function findApplicationForSession(
  applicationId: string,
  sessionId: string,
) {
  const [record] = await getDatabase()
    .select({ application: applications, batch: batches })
    .from(applications)
    .innerJoin(batches, eq(applications.batchId, batches.id))
    .where(
      and(eq(applications.id, applicationId), eq(batches.sessionId, sessionId)),
    )
    .limit(1);
  return record ?? null;
}

export async function listApplicationsForBatchSession(
  batchId: string,
  sessionId: string,
) {
  return getDatabase()
    .select({ application: applications })
    .from(applications)
    .innerJoin(batches, eq(applications.batchId, batches.id))
    .where(and(eq(batches.id, batchId), eq(batches.sessionId, sessionId)))
    .orderBy(asc(applications.createdAt));
}

export async function updateApplicationDraftForSession(input: {
  applicationId: string;
  confirmed?: boolean;
  documentPath?: string | null;
  documentStatus?: (typeof applications.$inferInsert)["documentStatus"];
  expectedUpdatedAt?: Date;
  originType?: (typeof applications.$inferInsert)["originType"];
  regulatoryProfile?: (typeof applications.$inferInsert)["regulatoryProfile"];
  sessionId: string;
  submittedFields?: JsonObject;
}) {
  return getDatabase().transaction(async (transaction) => {
    const rows = await transaction.execute(sql`
      SELECT a.updated_at, b.status
      FROM applications a
      INNER JOIN batches b ON b.id = a.batch_id
      WHERE a.id = ${input.applicationId} AND b.session_id = ${input.sessionId}
      FOR UPDATE OF a
    `);
    const current = rows[0] as
      { status: string; updated_at: Date | string } | undefined;
    if (!current) throw new RecordNotFoundError();
    if (current.status !== "draft") throw new InvalidRecordStateError();
    if (
      input.expectedUpdatedAt &&
      new Date(current.updated_at).getTime() !==
        input.expectedUpdatedAt.getTime()
    ) {
      throw new ConcurrentModificationError();
    }

    const [updated] = await transaction
      .update(applications)
      .set({
        confirmed: input.confirmed,
        documentPath: input.documentPath,
        documentStatus: input.documentStatus,
        originType: input.originType,
        regulatoryProfile: input.regulatoryProfile,
        submittedFields: input.submittedFields,
      })
      .where(eq(applications.id, input.applicationId))
      .returning();
    return updated;
  });
}
