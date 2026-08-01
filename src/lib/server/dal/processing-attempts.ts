import "server-only";

import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  batches,
  labelJobs,
  processingAttempts,
  type JsonObject,
  type ProcessingTimingSpans,
} from "@/db/schema";
import {
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal/errors";
import {
  normalizeProcessingTimingSpans,
  normalizeProcessingTokenUsage,
  timingSpansTotalMs,
  type ProcessingTokenUsage,
} from "@/lib/server/dal/processing-attempt-values";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{7,199}$/;

function optionalLabel(value: string | undefined, maximumLength: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new TypeError("Invalid processing attempt label.");
  }
  return normalized;
}

export async function startProcessingAttempt(input: {
  attemptNumber: number;
  idempotencyKey: string;
  inngestRunId?: string;
  jobId: string;
  metadata?: JsonObject;
  model?: string;
  modelVariant?: string;
  promptVersion?: string;
  serviceTier?: string;
}) {
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new RangeError("Invalid processing attempt number.");
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new TypeError("Invalid processing attempt idempotency key.");
  }

  const db = getDatabase();
  const [created] = await db
    .insert(processingAttempts)
    .values({
      attemptNumber: input.attemptNumber,
      idempotencyKey: input.idempotencyKey,
      inngestRunId: optionalLabel(input.inngestRunId, 200),
      jobId: input.jobId,
      metadata: input.metadata ?? {},
      model: optionalLabel(input.model, 100),
      modelVariant: optionalLabel(input.modelVariant, 100),
      promptVersion: optionalLabel(input.promptVersion, 100),
      serviceTier: optionalLabel(input.serviceTier, 50),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { attempt: created, created: true };

  const [existing] = await db
    .select()
    .from(processingAttempts)
    .where(
      or(
        eq(processingAttempts.idempotencyKey, input.idempotencyKey),
        and(
          eq(processingAttempts.jobId, input.jobId),
          eq(processingAttempts.attemptNumber, input.attemptNumber),
        ),
      ),
    )
    .limit(1);
  if (!existing) throw new InvalidRecordStateError();
  if (
    existing.idempotencyKey !== input.idempotencyKey ||
    existing.jobId !== input.jobId ||
    existing.attemptNumber !== input.attemptNumber
  ) {
    throw new InvalidRecordStateError();
  }
  return { attempt: existing, created: false };
}

export async function finishProcessingAttempt(input: {
  errorCode?: string;
  finishedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
  model?: string;
  modelVariant?: string;
  promptVersion?: string;
  serviceTier?: string;
  status: "completed" | "failed";
  timingSpans?: ProcessingTimingSpans;
  tokenUsage?: ProcessingTokenUsage;
}) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new TypeError("Invalid processing attempt idempotency key.");
  }
  const db = getDatabase();
  const [current] = await db
    .select()
    .from(processingAttempts)
    .where(eq(processingAttempts.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!current) throw new RecordNotFoundError();
  if (current.status !== "running") {
    return { attempt: current, updated: false };
  }

  const errorCode = optionalLabel(input.errorCode, 100);
  if (input.status === "failed" && !errorCode) {
    throw new TypeError("A safe error code is required for a failed attempt.");
  }
  const finishedAt = input.finishedAt ?? new Date();
  if (!Number.isFinite(finishedAt.getTime())) {
    throw new TypeError("Invalid processing attempt completion time.");
  }
  const timingSpans = normalizeProcessingTimingSpans(input.timingSpans);
  const tokenUsage = normalizeProcessingTokenUsage(input.tokenUsage);

  const totalLatencyMs = timingSpansTotalMs(
    timingSpans,
    Math.max(0, finishedAt.getTime() - current.startedAt.getTime()),
  );
  const [updated] = await db
    .update(processingAttempts)
    .set({
      ...tokenUsage,
      errorCode: input.status === "failed" ? errorCode : null,
      finishedAt,
      metadata: input.metadata,
      model: optionalLabel(input.model, 100),
      modelVariant: optionalLabel(input.modelVariant, 100),
      promptVersion: optionalLabel(input.promptVersion, 100),
      serviceTier: optionalLabel(input.serviceTier, 50),
      status: input.status,
      timingSpans,
      totalLatencyMs,
    })
    .where(
      and(
        eq(processingAttempts.id, current.id),
        eq(processingAttempts.status, "running"),
      ),
    )
    .returning();
  if (updated) return { attempt: updated, updated: true };

  const [completedByAnotherInvocation] = await db
    .select()
    .from(processingAttempts)
    .where(eq(processingAttempts.id, current.id))
    .limit(1);
  if (!completedByAnotherInvocation) throw new RecordNotFoundError();
  return { attempt: completedByAnotherInvocation, updated: false };
}

export async function recordProcessingAttemptReplay(idempotencyKey: string) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new TypeError("Invalid processing attempt idempotency key.");
  }
  const [updated] = await getDatabase()
    .update(processingAttempts)
    .set({
      lastReplayedAt: new Date(),
      replayCount: sql`${processingAttempts.replayCount} + 1`,
    })
    .where(eq(processingAttempts.idempotencyKey, idempotencyKey))
    .returning();
  if (!updated) throw new RecordNotFoundError();
  return updated;
}

export async function findLatestProcessingAttempt(jobId: string) {
  const [attempt] = await getDatabase()
    .select()
    .from(processingAttempts)
    .where(eq(processingAttempts.jobId, jobId))
    .orderBy(desc(processingAttempts.attemptNumber))
    .limit(1);
  return attempt ?? null;
}

export async function listProcessingAttemptsForJobSession(
  jobId: string,
  sessionId: string,
) {
  return getDatabase()
    .select({ attempt: processingAttempts })
    .from(processingAttempts)
    .innerJoin(labelJobs, eq(processingAttempts.jobId, labelJobs.id))
    .innerJoin(batches, eq(labelJobs.batchId, batches.id))
    .where(and(eq(labelJobs.id, jobId), eq(batches.sessionId, sessionId)))
    .orderBy(asc(processingAttempts.attemptNumber));
}
