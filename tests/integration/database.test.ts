import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase } from "@/db/client";
import {
  batches,
  labelJobs,
  queueOutbox,
  reviewDecisions,
  usageLedger,
} from "@/db/schema";
import {
  cancelBatchForSession,
  claimPendingOutboxEvents,
  createBatchDraft,
  deleteBatchForSession,
  findBatchForSession,
  recordReviewDecision,
  retryFailedBatchJobsForSession,
  submitBatchForSession,
} from "@/lib/server/dal";

const originalNodeEnv = process.env.NODE_ENV;
Reflect.set(process.env, "NODE_ENV", "development");
loadEnvConfig(process.cwd(), true);
Reflect.set(process.env, "NODE_ENV", originalNodeEnv);

const createdSessions = new Set<string>();

afterEach(async () => {
  const db = getDatabase();
  for (const sessionId of createdSessions) {
    await db.delete(batches).where(eq(batches.sessionId, sessionId));
    await db.delete(usageLedger).where(eq(usageLedger.sessionId, sessionId));
  }
  createdSessions.clear();
});

function application() {
  return {
    confirmed: true,
    externalId: "INT-001",
    originType: "domestic" as const,
    regulatoryProfile: "faa_distilled_spirits" as const,
    submittedFields: {
      application: {
        beverageFamily: "distilled_spirits",
        brandName: "Integration Test",
        classType: "Bourbon Whiskey",
        netContents: { unit: "mL", value: 750 },
        profile: "faa_distilled_spirits",
        responsibleParty: { address: "Lexington, KY", name: "Test Bottler" },
      },
    },
  };
}

describe("database authorization and transactions", () => {
  it("isolates records by user session", async () => {
    const sessionId = `integration-${randomUUID()}`;
    createdSessions.add(sessionId);
    const batch = await createBatchDraft({
      applications: [application()],
      mode: "single",
      name: "Session isolation",
      sessionId,
    });

    await expect(
      findBatchForSession(batch.id, "different-session"),
    ).resolves.toBeNull();
    await expect(
      deleteBatchForSession(batch.id, "different-session"),
    ).rejects.toThrow();
    await expect(
      findBatchForSession(batch.id, sessionId),
    ).resolves.toMatchObject({
      id: batch.id,
    });
  });

  it("charges quota exactly once across racing duplicate submissions", async () => {
    const sessionId = `integration-${randomUUID()}`;
    createdSessions.add(sessionId);
    const batch = await createBatchDraft({
      applications: [application()],
      mode: "single",
      name: "Atomic quota",
      sessionId,
    });
    const input = {
      batchId: batch.id,
      quota: {
        globalLimit: 10_000,
        ipHash: `ip-${randomUUID()}`,
        ipLimit: 10,
        kind: "integration_live_model_job",
        sessionLimit: 10,
        units: 1,
      },
      rulesetVersion: "integration-test",
      sessionId,
    };

    const results = await Promise.all([
      submitBatchForSession(input),
      submitBatchForSession(input),
    ]);
    expect(results.filter((result) => !result.alreadySubmitted)).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.alreadySubmitted)).toHaveLength(1);

    const ledger = await getDatabase().execute(sql`
      SELECT coalesce(sum(units), 0)::integer AS units
      FROM usage_ledger
      WHERE session_id = ${sessionId}
        AND kind = 'integration_live_model_job'
    `);
    expect(ledger[0]?.units).toBe(1);
  });

  it("rolls back the quota reservation when job creation cannot proceed", async () => {
    const sessionId = `integration-${randomUUID()}`;
    createdSessions.add(sessionId);
    const batch = await createBatchDraft({
      applications: [{ ...application(), confirmed: false }],
      mode: "single",
      name: "Quota rollback",
      sessionId,
    });
    await expect(
      submitBatchForSession({
        batchId: batch.id,
        quota: {
          globalLimit: 10_000,
          ipHash: `ip-${randomUUID()}`,
          ipLimit: 10,
          kind: "integration_rollback",
          sessionLimit: 10,
          units: 1,
        },
        rulesetVersion: "integration-test",
        sessionId,
      }),
    ).rejects.toThrow();

    const ledger = await getDatabase().execute(sql`
      SELECT count(*)::integer AS count
      FROM usage_ledger
      WHERE session_id = ${sessionId} AND kind = 'integration_rollback'
    `);
    expect(ledger[0]?.count).toBe(0);
  });

  it("claims only the requested interactive outbox jobs", async () => {
    const sessionId = `integration-${randomUUID()}`;
    createdSessions.add(sessionId);
    const batch = await createBatchDraft({
      applications: [
        application(),
        { ...application(), externalId: "INT-002" },
      ],
      mode: "batch",
      name: "Targeted outbox",
      sessionId,
    });
    const submitted = await submitBatchForSession({
      batchId: batch.id,
      rulesetVersion: "integration-test",
      sessionId,
    });

    const claimed = await claimPendingOutboxEvents(1, [submitted.jobIds[1]]);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].jobId).toBe(submitted.jobIds[1]);
    const claimedByEvent = await claimPendingOutboxEvents(1, undefined, [
      `label-verification-${submitted.jobIds[0]}`,
    ]);
    expect(claimedByEvent).toHaveLength(1);
    expect(claimedByEvent[0].jobId).toBe(submitted.jobIds[0]);
    await expect(claimPendingOutboxEvents(1, ["invalid-id"])).rejects.toThrow(
      /identifiers/i,
    );
  });

  it("prevents concurrent review decisions from overwriting one another and keeps decisions immutable", async () => {
    const sessionId = `integration-${randomUUID()}`;
    createdSessions.add(sessionId);
    const batch = await createBatchDraft({
      applications: [application()],
      mode: "single",
      name: "Review concurrency",
      sessionId,
    });
    const submitted = await submitBatchForSession({
      batchId: batch.id,
      rulesetVersion: "integration-test",
      sessionId,
    });
    const jobId = submitted.jobIds[0];
    await getDatabase()
      .update(labelJobs)
      .set({ status: "review_required" })
      .where(eq(labelJobs.id, jobId));

    const attempts = await Promise.allSettled([
      recordReviewDecision({
        decision: "confirmed_clear",
        expectedReviewVersion: 0,
        jobId,
        sessionId,
      }),
      recordReviewDecision({
        decision: "return_for_correction",
        expectedReviewVersion: 0,
        jobId,
        notes: "The warning must be corrected before resubmission.",
        sessionId,
      }),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);

    const [decision] = await getDatabase()
      .select()
      .from(reviewDecisions)
      .where(eq(reviewDecisions.jobId, jobId));
    await expect(
      getDatabase()
        .update(reviewDecisions)
        .set({ notes: "Changed after the fact" })
        .where(eq(reviewDecisions.id, decision.id)),
    ).rejects.toThrow();
    const [unchangedDecision] = await getDatabase()
      .select({ notes: reviewDecisions.notes })
      .from(reviewDecisions)
      .where(eq(reviewDecisions.id, decision.id));
    expect(unchangedDecision.notes).toBe(decision.notes);
  });

  it("cancels queued work and can durably retry independently failed jobs", async () => {
    const cancelSession = `integration-${randomUUID()}`;
    createdSessions.add(cancelSession);
    const cancelDraft = await createBatchDraft({
      applications: [
        application(),
        { ...application(), externalId: "INT-002" },
      ],
      mode: "batch",
      name: "Cancellation",
      sessionId: cancelSession,
    });
    const cancelledSubmission = await submitBatchForSession({
      batchId: cancelDraft.id,
      rulesetVersion: "integration-test",
      sessionId: cancelSession,
    });
    await expect(
      cancelBatchForSession(cancelDraft.id, "different-session"),
    ).rejects.toThrow();
    const cancelled = await cancelBatchForSession(
      cancelDraft.id,
      cancelSession,
    );
    expect(cancelled.cancelledCount).toBe(2);
    const cancelledJobs = await getDatabase()
      .select({ status: labelJobs.status })
      .from(labelJobs)
      .where(eq(labelJobs.batchId, cancelDraft.id));
    expect(cancelledJobs.every((job) => job.status === "cancelled")).toBe(true);
    expect(cancelledSubmission.jobIds).toHaveLength(2);

    const retrySession = `integration-${randomUUID()}`;
    createdSessions.add(retrySession);
    const retryDraft = await createBatchDraft({
      applications: [application()],
      mode: "single",
      name: "Retry",
      sessionId: retrySession,
    });
    const retrySubmission = await submitBatchForSession({
      batchId: retryDraft.id,
      rulesetVersion: "integration-test",
      sessionId: retrySession,
    });
    const retryJobId = retrySubmission.jobIds[0];
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(labelJobs)
        .set({ errorCode: "PROVIDER_TIMEOUT", status: "failed" })
        .where(eq(labelJobs.id, retryJobId));
      await transaction
        .update(queueOutbox)
        .set({ status: "sent" })
        .where(eq(queueOutbox.jobId, retryJobId));
    });
    const retried = await retryFailedBatchJobsForSession(
      retryDraft.id,
      retrySession,
    );
    expect(retried).toEqual([retryJobId]);
    const [retryState] = await getDatabase()
      .select({ errorCode: labelJobs.errorCode, status: labelJobs.status })
      .from(labelJobs)
      .where(eq(labelJobs.id, retryJobId));
    const [outboxState] = await getDatabase()
      .select({ status: queueOutbox.status })
      .from(queueOutbox)
      .where(eq(queueOutbox.jobId, retryJobId));
    expect(retryState).toEqual({ errorCode: null, status: "queued" });
    expect(outboxState.status).toBe("pending");
  }, 15_000);
});
