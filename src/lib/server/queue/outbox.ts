import "server-only";

import { inngest } from "@/inngest/client";
import {
  claimPendingOutboxEvents,
  markOutboxEventFailed,
  markOutboxEventSent,
} from "@/lib/server/dal";

function safeQueueError(reason: unknown): string {
  if (reason instanceof Error && /401|403|unauthor/i.test(reason.message))
    return "QUEUE_AUTHENTICATION_FAILED";
  return "QUEUE_DELIVERY_FAILED";
}

export async function dispatchPendingOutbox(
  input: {
    eventIds?: string[];
    jobIds?: string[];
    limit?: number;
  } = {},
) {
  if (input.jobIds?.length === 0 || input.eventIds?.length === 0)
    return { delivered: 0, pending: 0 };
  // Target interactive submissions so an unrelated backlog cannot delay their
  // events. Scheduled recovery omits jobIds and sweeps globally. SKIP LOCKED
  // prevents either path from sending the same row concurrently.
  const events = await claimPendingOutboxEvents(
    Math.min(
      Math.max(
        input.limit ?? input.jobIds?.length ?? input.eventIds?.length ?? 300,
        1,
      ),
      300,
    ),
    input.jobIds,
    input.eventIds,
  );
  if (!events.length) return { delivered: 0, pending: 0 };
  try {
    await inngest.send(
      events.map((event) => ({
        id: event.eventId,
        name: event.eventName,
        data: event.payload,
      })),
    );
    await Promise.all(
      events.map((event) => markOutboxEventSent(event.eventId)),
    );
    return { delivered: events.length, pending: 0 };
  } catch (reason) {
    const nextAttemptAt = new Date(Date.now() + 30_000);
    const safeErrorCode = safeQueueError(reason);
    await Promise.all(
      events.map((event) =>
        markOutboxEventFailed({
          eventId: event.eventId,
          nextAttemptAt,
          safeErrorCode,
        }),
      ),
    );
    return { delivered: 0, pending: events.length };
  }
}
