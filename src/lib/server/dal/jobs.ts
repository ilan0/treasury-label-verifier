import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  applications,
  artifacts,
  batches,
  extractions,
  labelJobs,
  reviewDecisions,
  ruleResults,
  statusEvents,
  type JsonObject,
  type NewLabelJob,
} from "@/db/schema";
import {
  ConcurrentModificationError,
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal/errors";

type JobStatus = NonNullable<NewLabelJob["status"]>;

export async function findJobForSession(jobId: string, sessionId: string) {
  const [row] = await getDatabase()
    .select({ application: applications, batch: batches, job: labelJobs })
    .from(labelJobs)
    .innerJoin(batches, eq(labelJobs.batchId, batches.id))
    .innerJoin(applications, eq(labelJobs.applicationId, applications.id))
    .where(and(eq(labelJobs.id, jobId), eq(batches.sessionId, sessionId)))
    .limit(1);
  return row ?? null;
}

/** Internal worker lookup. Authorization occurs at queue-event verification. */
export async function getJobForProcessing(jobId: string) {
  const [record] = await getDatabase()
    .select({ application: applications, batch: batches, job: labelJobs })
    .from(labelJobs)
    .innerJoin(batches, eq(labelJobs.batchId, batches.id))
    .innerJoin(applications, eq(labelJobs.applicationId, applications.id))
    .where(eq(labelJobs.id, jobId))
    .limit(1);
  if (!record) return null;
  const artifactRows = await getDatabase()
    .select()
    .from(artifacts)
    .where(eq(artifacts.jobId, jobId))
    .orderBy(asc(artifacts.createdAt));
  return { ...record, artifacts: artifactRows };
}

export async function getJobResultsForSession(
  jobId: string,
  sessionId: string,
) {
  const record = await findJobForSession(jobId, sessionId);
  if (!record) return null;
  const db = getDatabase();
  const [extractionRows, resultRows, decisionRows, eventRows] =
    await Promise.all([
      db.select().from(extractions).where(eq(extractions.jobId, jobId)),
      db
        .select()
        .from(ruleResults)
        .where(eq(ruleResults.jobId, jobId))
        .orderBy(asc(ruleResults.ruleId)),
      db
        .select()
        .from(reviewDecisions)
        .where(eq(reviewDecisions.jobId, jobId))
        .orderBy(asc(reviewDecisions.reviewVersion)),
      db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.jobId, jobId))
        .orderBy(asc(statusEvents.createdAt)),
    ]);
  return {
    ...record,
    decisions: decisionRows,
    events: eventRows,
    extraction: extractionRows[0] ?? null,
    results: resultRows,
  };
}

export async function transitionJobStatus(input: {
  details?: JsonObject;
  expectedStatuses: JobStatus[];
  jobId: string;
  nextStatus: JobStatus;
  patch?: Partial<
    Pick<
      NewLabelJob,
      | "attemptCount"
      | "completedAt"
      | "confidence"
      | "errorCode"
      | "errorMessage"
      | "latencyMs"
      | "model"
      | "outcome"
      | "promptVersion"
      | "rulesetVersion"
      | "startedAt"
    >
  >;
}) {
  if (!input.expectedStatuses.length) throw new InvalidRecordStateError();
  return getDatabase().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(labelJobs)
      .set({ ...input.patch, status: input.nextStatus })
      .where(
        and(
          eq(labelJobs.id, input.jobId),
          inArray(labelJobs.status, input.expectedStatuses),
        ),
      )
      .returning();
    if (!updated) throw new InvalidRecordStateError();
    await transaction.insert(statusEvents).values({
      details: input.details ?? {},
      fromStatus:
        input.expectedStatuses.length === 1 ? input.expectedStatuses[0] : null,
      jobId: input.jobId,
      toStatus: input.nextStatus,
    });
    return updated;
  });
}

export async function persistJobEvaluation(input: {
  extraction: {
    confidence?: number;
    fields: JsonObject;
    imageQuality?: number;
    latencyMs: number;
    model: string;
    promptVersion: string;
    rawText?: string;
    source?: "openai" | "cached_demo";
    usage?: JsonObject;
  };
  job: {
    confidence: number;
    latencyMs: number;
    model: string;
    outcome: "precheck_passed" | "human_review_required" | "correction_needed";
    promptVersion: string;
    terminalStatus: "completed" | "review_required" | "correction_needed";
  };
  jobId: string;
  results: Array<{
    confidence?: number;
    evidence?: JsonObject;
    expectedValue?: unknown;
    explanation: string;
    observedValue?: unknown;
    ruleId: string;
    severity: "information" | "warning" | "error";
    sourceCitation: JsonObject;
    status: "pass" | "fail" | "review" | "not_applicable" | "not_assessed";
  }>;
}) {
  return getDatabase().transaction(async (transaction) => {
    const locked = await transaction.execute(sql`
      SELECT status FROM label_jobs WHERE id = ${input.jobId} FOR UPDATE
    `);
    const current = locked[0] as { status: string } | undefined;
    if (!current) throw new RecordNotFoundError();
    if (
      ["completed", "review_required", "correction_needed"].includes(
        current.status,
      )
    ) {
      return { alreadyPersisted: true };
    }
    if (current.status !== "verifying") throw new InvalidRecordStateError();

    await transaction
      .insert(extractions)
      .values({
        confidence: input.extraction.confidence,
        fields: input.extraction.fields,
        imageQuality: input.extraction.imageQuality,
        jobId: input.jobId,
        latencyMs: input.extraction.latencyMs,
        model: input.extraction.model,
        promptVersion: input.extraction.promptVersion,
        rawText: input.extraction.rawText,
        source: input.extraction.source ?? "openai",
        usage: input.extraction.usage ?? {},
      })
      .onConflictDoNothing();

    if (input.results.length) {
      await transaction
        .insert(ruleResults)
        .values(
          input.results.map((result) => ({
            confidence: result.confidence,
            evidence: result.evidence ?? {},
            expectedValue: result.expectedValue,
            explanation: result.explanation,
            jobId: input.jobId,
            observedValue: result.observedValue,
            ruleId: result.ruleId,
            severity: result.severity,
            sourceCitation: result.sourceCitation,
            status: result.status,
          })),
        )
        .onConflictDoUpdate({
          target: [ruleResults.jobId, ruleResults.ruleId],
          set: {
            confidence: sql`excluded.confidence`,
            evidence: sql`excluded.evidence`,
            expectedValue: sql`excluded.expected_value`,
            explanation: sql`excluded.explanation`,
            observedValue: sql`excluded.observed_value`,
            severity: sql`excluded.severity`,
            sourceCitation: sql`excluded.source_citation`,
            status: sql`excluded.status`,
          },
        });
    }

    await transaction
      .update(labelJobs)
      .set({
        completedAt: new Date(),
        confidence: input.job.confidence,
        errorCode: null,
        errorMessage: null,
        latencyMs: input.job.latencyMs,
        model: input.job.model,
        outcome: input.job.outcome,
        promptVersion: input.job.promptVersion,
        status: input.job.terminalStatus,
      })
      .where(eq(labelJobs.id, input.jobId));
    await transaction.insert(statusEvents).values({
      fromStatus: "verifying",
      jobId: input.jobId,
      toStatus: input.job.terminalStatus,
    });
    return { alreadyPersisted: false };
  });
}

export async function recordReviewDecision(input: {
  decision:
    "confirmed_clear" | "accepted_with_override" | "return_for_correction";
  expectedReviewVersion: number;
  jobId: string;
  notes?: string;
  overrides?: JsonObject;
  sessionId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const rows = await transaction.execute(sql`
      SELECT j.review_version, j.status
      FROM label_jobs j
      INNER JOIN batches b ON b.id = j.batch_id
      WHERE j.id = ${input.jobId} AND b.session_id = ${input.sessionId}
      FOR UPDATE OF j
    `);
    const job = rows[0] as
      { review_version: number; status: string } | undefined;
    if (!job) throw new RecordNotFoundError();
    if (
      !["completed", "review_required", "correction_needed"].includes(
        job.status,
      )
    ) {
      throw new InvalidRecordStateError();
    }
    if (job.review_version !== input.expectedReviewVersion) {
      throw new ConcurrentModificationError();
    }

    const reviewVersion = job.review_version + 1;
    const [decision] = await transaction
      .insert(reviewDecisions)
      .values({
        decision: input.decision,
        jobId: input.jobId,
        notes: input.notes,
        overrides: input.overrides ?? {},
        reviewVersion,
        sessionId: input.sessionId,
      })
      .returning();
    await transaction
      .update(labelJobs)
      .set({ reviewVersion })
      .where(eq(labelJobs.id, input.jobId));
    return decision;
  });
}
