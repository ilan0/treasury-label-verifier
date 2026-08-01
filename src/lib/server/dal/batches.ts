import "server-only";

import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  applications,
  artifacts,
  batches,
  labelJobs,
  queueOutbox,
  statusEvents,
  type JsonObject,
} from "@/db/schema";
import {
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal/errors";

type RegulatoryProfile =
  (typeof applications.$inferInsert)["regulatoryProfile"];
type OriginType = (typeof applications.$inferInsert)["originType"];
type BatchMode = (typeof batches.$inferInsert)["mode"];

export type DraftApplicationInput = {
  confirmed?: boolean;
  externalId: string;
  originType?: OriginType;
  regulatoryProfile: RegulatoryProfile;
  submittedFields: JsonObject;
};

export async function createBatchDraft(input: {
  applications: DraftApplicationInput[];
  idempotencyKey?: string;
  mode: BatchMode;
  name: string;
  sessionId: string;
}) {
  if (input.applications.length < 1 || input.applications.length > 300) {
    throw new RangeError(
      "A batch must contain between 1 and 300 applications.",
    );
  }
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    if (input.idempotencyKey) {
      const [existing] = await transaction
        .select()
        .from(batches)
        .where(
          and(
            eq(batches.sessionId, input.sessionId),
            eq(batches.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }

    const [batch] = await transaction
      .insert(batches)
      .values({
        idempotencyKey: input.idempotencyKey,
        mode: input.mode,
        name: input.name,
        sessionId: input.sessionId,
        totalCount: input.applications.length,
      })
      .returning();

    await transaction.insert(applications).values(
      input.applications.map((application) => ({
        batchId: batch.id,
        confirmed: application.confirmed ?? false,
        externalId: application.externalId,
        originType: application.originType ?? "unknown",
        regulatoryProfile: application.regulatoryProfile,
        submittedFields: application.submittedFields,
      })),
    );
    return batch;
  });
}

/**
 * Creates a confirmed demo and its queued jobs atomically. Demo cards are a
 * primary user entry point, so they should not pay for a draft
 * transaction, a submit transaction, and a post-submit application lookup.
 */
export async function createAndSubmitDemoBatch(input: {
  applications: DraftApplicationInput[];
  idempotencyKey?: string;
  mode: "demo" | "benchmark";
  name: string;
  quota?: {
    globalLimit: number;
    ipHash: string;
    ipLimit: number;
    kind: string;
    sessionLimit: number;
    units: number;
  };
  rulesetVersion: string;
  sessionId: string;
}) {
  if (input.applications.length < 1 || input.applications.length > 300) {
    throw new RangeError(
      "A batch must contain between 1 and 300 applications.",
    );
  }
  return getDatabase().transaction(async (transaction) => {
    if (input.idempotencyKey) {
      const existing = await transaction.execute(sql`
        SELECT batch.id, application.id AS application_id, job.id AS job_id
        FROM batches AS batch
        INNER JOIN applications AS application ON application.batch_id = batch.id
        LEFT JOIN label_jobs AS job ON job.application_id = application.id
        WHERE batch.session_id = ${input.sessionId}
          AND batch.idempotency_key = ${input.idempotencyKey}
        ORDER BY application.created_at
      `);
      if (existing.length) {
        return {
          alreadySubmitted: true,
          applicationIds: existing.map((row) => row.application_id as string),
          batchId: existing[0]!.id as string,
          jobIds: existing
            .map((row) => row.job_id as string | null)
            .filter((value): value is string => Boolean(value)),
        };
      }
    }

    if (input.quota) {
      const quota = await transaction.execute(sql`
        SELECT proofcheck_consume_usage_quota(
          ${input.sessionId}, ${input.quota.ipHash}, ${input.quota.kind},
          ${input.quota.units}, ${input.quota.sessionLimit},
          ${input.quota.ipLimit}, ${input.quota.globalLimit}
        ) AS allowed
      `);
      if (quota[0]?.allowed !== true) throw new Error("QUOTA_EXCEEDED");
    }

    const [batch] = await transaction
      .insert(batches)
      .values({
        idempotencyKey: input.idempotencyKey,
        mode: input.mode,
        name: input.name,
        sessionId: input.sessionId,
        status: "queued",
        totalCount: input.applications.length,
      })
      .returning({ id: batches.id });
    const applicationRows = await transaction
      .insert(applications)
      .values(
        input.applications.map((application) => ({
          batchId: batch.id,
          confirmed: true,
          externalId: application.externalId,
          originType: application.originType ?? "unknown",
          regulatoryProfile: application.regulatoryProfile,
          submittedFields: application.submittedFields,
        })),
      )
      .returning({ id: applications.id });
    const jobRows = await transaction
      .insert(labelJobs)
      .values(
        applicationRows.map((application) => ({
          applicationId: application.id,
          batchId: batch.id,
          rulesetVersion: input.rulesetVersion,
          status: "queued" as const,
        })),
      )
      .returning({ id: labelJobs.id });
    await transaction.insert(statusEvents).values(
      jobRows.map((job) => ({
        details: { source: "demo_submission" },
        jobId: job.id,
        toStatus: "queued" as const,
      })),
    );
    await transaction.insert(queueOutbox).values(
      jobRows.map((job) => ({
        eventId: `label-verification-${job.id}`,
        eventName:
          input.mode === "benchmark"
            ? "label/verification.bulk"
            : "label/verification.interactive",
        jobId: job.id,
        payload: { jobId: job.id },
      })),
    );
    return {
      alreadySubmitted: false,
      applicationIds: applicationRows.map((row) => row.id),
      batchId: batch.id,
      jobIds: jobRows.map((row) => row.id),
    };
  });
}

export async function findBatchForSession(batchId: string, sessionId: string) {
  const [batch] = await getDatabase()
    .select()
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.sessionId, sessionId)))
    .limit(1);
  return batch ?? null;
}

export async function listRecentBatchesForSession(
  sessionId: string,
  limit = 10,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("Invalid recent batch limit.");
  }
  return getDatabase()
    .select()
    .from(batches)
    .where(
      and(eq(batches.sessionId, sessionId), gt(batches.expiresAt, new Date())),
    )
    .orderBy(desc(batches.createdAt))
    .limit(limit);
}

export async function submitBatchForSession(input: {
  batchId: string;
  quota?: {
    globalLimit: number;
    ipHash: string;
    ipLimit: number;
    kind: string;
    sessionLimit: number;
    units: number;
  };
  rulesetVersion: string;
  sessionId: string;
}) {
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const locked = await transaction.execute(sql`
      SELECT id, status, mode
      FROM batches
      WHERE id = ${input.batchId} AND session_id = ${input.sessionId}
      FOR UPDATE
    `);
    const batch = locked[0] as
      { id: string; mode: BatchMode; status: string } | undefined;
    if (!batch) throw new RecordNotFoundError();

    if (batch.status !== "draft") {
      if (
        ["queued", "processing", "completed", "partial"].includes(batch.status)
      ) {
        return {
          alreadySubmitted: true,
          batchId: input.batchId,
          jobIds: [] as string[],
        };
      }
      throw new InvalidRecordStateError();
    }

    if (input.quota) {
      const quotaValues = [
        input.quota.units,
        input.quota.sessionLimit,
        input.quota.ipLimit,
        input.quota.globalLimit,
      ];
      if (
        quotaValues.some((value) => !Number.isInteger(value) || value < 0) ||
        input.quota.units < 1
      ) {
        throw new RangeError("Invalid usage quota arguments.");
      }
      const quota = await transaction.execute(sql`
        SELECT proofcheck_consume_usage_quota(
          ${input.sessionId},
          ${input.quota.ipHash},
          ${input.quota.kind},
          ${input.quota.units},
          ${input.quota.sessionLimit},
          ${input.quota.ipLimit},
          ${input.quota.globalLimit}
        ) AS allowed
      `);
      if (quota[0]?.allowed !== true) throw new Error("QUOTA_EXCEEDED");
    }

    const applicationRows = await transaction
      .select({ confirmed: applications.confirmed, id: applications.id })
      .from(applications)
      .where(eq(applications.batchId, input.batchId))
      .orderBy(asc(applications.createdAt));
    if (
      !applicationRows.length ||
      applicationRows.some((item) => !item.confirmed)
    ) {
      throw new InvalidRecordStateError();
    }

    const createdJobs = await transaction
      .insert(labelJobs)
      .values(
        applicationRows.map((application) => ({
          applicationId: application.id,
          batchId: input.batchId,
          rulesetVersion: input.rulesetVersion,
          status: "queued" as const,
        })),
      )
      .returning({ applicationId: labelJobs.applicationId, id: labelJobs.id });

    await transaction.insert(statusEvents).values(
      createdJobs.map((job) => ({
        details: { source: "submission" },
        jobId: job.id,
        toStatus: "queued" as const,
      })),
    );
    await transaction.insert(queueOutbox).values(
      createdJobs.map((job) => ({
        eventId: `label-verification-${job.id}`,
        eventName:
          batch.mode === "batch"
            ? "label/verification.bulk"
            : "label/verification.interactive",
        jobId: job.id,
        payload: { jobId: job.id },
      })),
    );
    await transaction.execute(sql`
      UPDATE artifacts AS artifact
      SET job_id = job.id
      FROM label_jobs AS job
      WHERE artifact.application_id = job.application_id
        AND artifact.purpose = 'label_artwork'
        AND job.batch_id = ${input.batchId}
    `);

    await transaction
      .update(batches)
      .set({ status: "queued", totalCount: createdJobs.length })
      .where(eq(batches.id, input.batchId));

    return {
      alreadySubmitted: false,
      batchId: input.batchId,
      jobIds: createdJobs.map((job) => job.id),
    };
  });
}

export async function getBatchSummaryForSession(
  batchId: string,
  sessionId: string,
) {
  const batch = await findBatchForSession(batchId, sessionId);
  if (!batch) return null;

  const statusCounts = await getDatabase()
    .select({ count: sql<number>`count(*)::integer`, status: labelJobs.status })
    .from(labelJobs)
    .where(eq(labelJobs.batchId, batchId))
    .groupBy(labelJobs.status);
  return {
    ...batch,
    counts: Object.fromEntries(
      statusCounts.map((item) => [item.status, item.count]),
    ),
  };
}

export async function reconcileBatchStatus(batchId: string) {
  const rows = await getDatabase().execute(sql`
    UPDATE batches AS batch
    SET status = CASE
      WHEN batch.status = 'cancelled' THEN 'cancelled'::batch_status
      WHEN NOT EXISTS (SELECT 1 FROM label_jobs job WHERE job.batch_id = batch.id)
        THEN 'queued'::batch_status
      WHEN EXISTS (
        SELECT 1 FROM label_jobs job
        WHERE job.batch_id = batch.id
          AND job.status NOT IN (
            'completed', 'review_required', 'correction_needed', 'rejected',
            'failed', 'cancelled', 'expired'
          )
      ) THEN CASE
        WHEN EXISTS (
          SELECT 1 FROM label_jobs job
          WHERE job.batch_id = batch.id
            AND job.status IN (
              'completed', 'review_required', 'correction_needed', 'rejected',
              'failed', 'cancelled', 'expired'
            )
        ) THEN 'processing'::batch_status
        ELSE 'queued'::batch_status
      END
      WHEN NOT EXISTS (
        SELECT 1 FROM label_jobs job
        WHERE job.batch_id = batch.id AND job.status NOT IN ('failed', 'rejected', 'expired')
      ) THEN 'failed'::batch_status
      WHEN EXISTS (
        SELECT 1 FROM label_jobs job
        WHERE job.batch_id = batch.id AND job.status IN ('failed', 'rejected', 'cancelled', 'expired')
      ) THEN 'partial'::batch_status
      ELSE 'completed'::batch_status
    END
    WHERE batch.id = ${batchId}
    RETURNING batch.status
  `);
  if (!rows[0]) throw new RecordNotFoundError();
  return rows[0].status as
    "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";
}

export async function cancelBatchForSession(
  batchId: string,
  sessionId: string,
) {
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const [batch] = await transaction
      .update(batches)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(batches.id, batchId),
          eq(batches.sessionId, sessionId),
          sql`${batches.status} in ('draft', 'queued', 'processing')`,
        ),
      )
      .returning();
    if (!batch) throw new RecordNotFoundError();

    const cancelled = await transaction
      .update(labelJobs)
      .set({ completedAt: new Date(), status: "cancelled" })
      .where(
        and(
          eq(labelJobs.batchId, batchId),
          sql`${labelJobs.status} in ('draft', 'queued', 'validating')`,
        ),
      )
      .returning({ id: labelJobs.id });
    if (cancelled.length) {
      await transaction.insert(statusEvents).values(
        cancelled.map((job) => ({
          details: { source: "batch_cancellation" },
          jobId: job.id,
          toStatus: "cancelled" as const,
        })),
      );
    }
    return { batch, cancelledCount: cancelled.length };
  });
}

export async function retryFailedBatchJobsForSession(
  batchId: string,
  sessionId: string,
) {
  const db = getDatabase();
  const result = await db.transaction(async (transaction) => {
    const ownership = await transaction.execute(sql`
      SELECT id FROM batches
      WHERE id = ${batchId} AND session_id = ${sessionId}
      FOR UPDATE
    `);
    if (!ownership[0]) throw new RecordNotFoundError();

    await transaction.execute(sql`
      UPDATE queue_outbox AS outbox
      SET event_id = 'label-verification-retry-' || job.id || '-' || (job.attempt_count + 1),
          status = 'pending',
          last_error = null,
          locked_at = null,
          next_attempt_at = now(),
          sent_at = null,
          updated_at = now()
      FROM label_jobs AS job
      WHERE outbox.job_id = job.id
        AND job.batch_id = ${batchId}
        AND job.status = 'failed'
    `);
    const retried = await transaction
      .update(labelJobs)
      .set({
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        outcome: null,
        status: "queued",
      })
      .where(
        and(eq(labelJobs.batchId, batchId), eq(labelJobs.status, "failed")),
      )
      .returning({ id: labelJobs.id });
    if (retried.length) {
      await transaction.insert(statusEvents).values(
        retried.map((job) => ({
          details: { source: "batch_human_retry" },
          fromStatus: "failed" as const,
          jobId: job.id,
          toStatus: "queued" as const,
        })),
      );
    }
    return retried.map((job) => job.id);
  });
  if (result.length) await reconcileBatchStatus(batchId);
  return result;
}

export async function deleteBatchForSession(
  batchId: string,
  sessionId: string,
) {
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const paths = await transaction
      .select({ storagePath: artifacts.storagePath })
      .from(artifacts)
      .innerJoin(batches, eq(artifacts.batchId, batches.id))
      .where(and(eq(batches.id, batchId), eq(batches.sessionId, sessionId)));
    const [deleted] = await transaction
      .delete(batches)
      .where(and(eq(batches.id, batchId), eq(batches.sessionId, sessionId)))
      .returning({ id: batches.id });
    if (!deleted) throw new RecordNotFoundError();
    return paths.map((item) => item.storagePath);
  });
}
