import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { queueOutbox } from "@/db/schema";
import {
  findJobForSession,
  reconcileBatchStatus,
  transitionJobStatus,
} from "@/lib/server/dal";
import { acceptedResponse, errorResponse } from "@/lib/server/http";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { jobId } = await context.params;
    const record = await findJobForSession(jobId, session.recordId);
    if (!record)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This job is unavailable or has expired.",
        },
        { status: 404 },
      );
    if (record.job.status !== "failed")
      return Response.json(
        {
          error: "NOT_RETRYABLE",
          message: "Only recoverable failed jobs can be retried.",
        },
        { status: 409 },
      );
    await transitionJobStatus({
      jobId,
      expectedStatuses: ["failed"],
      nextStatus: "queued",
      patch: { completedAt: null, errorCode: null, errorMessage: null },
      details: { source: "human_retry" },
    });
    const eventId = `label-verification-retry-${jobId}-${record.job.attemptCount + 1}`;
    await getDatabase()
      .update(queueOutbox)
      .set({
        eventId,
        lastError: null,
        lockedAt: null,
        nextAttemptAt: new Date(),
        sentAt: null,
        status: "pending",
      })
      .where(eq(queueOutbox.jobId, jobId));
    await reconcileBatchStatus(record.batch.id);
    const queue = await dispatchPendingOutbox({ jobIds: [jobId], limit: 1 });
    return acceptedResponse({ jobId, status: "queued", queue });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
