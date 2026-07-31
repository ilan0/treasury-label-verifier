import { retryFailedBatchJobsForSession } from "@/lib/server/dal";
import { acceptedResponse, errorResponse } from "@/lib/server/http";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import { after } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { batchId } = await context.params;
    const jobIds = await retryFailedBatchJobsForSession(
      batchId,
      session.recordId,
    );
    after(() => dispatchPendingOutbox({ jobIds, limit: 300 }));
    const queue = { delivered: 0, pending: jobIds.length };
    return acceptedResponse({ batchId, jobIds, queue, retried: jobIds.length });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
