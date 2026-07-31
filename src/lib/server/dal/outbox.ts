import "server-only";

import { and, eq } from "drizzle-orm";

import { getDatabase, getSqlClient } from "@/db/client";
import { queueOutbox } from "@/db/schema";

export type ClaimedOutboxEvent = {
  attemptCount: number;
  eventId: string;
  eventName: string;
  id: string;
  jobId: string | null;
  payload: Record<string, unknown>;
};

export async function claimPendingOutboxEvents(
  limit = 100,
  jobIds?: string[],
  eventIds?: string[],
): Promise<ClaimedOutboxEvent[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
    throw new RangeError("Invalid outbox claim limit.");
  }
  if (
    jobIds &&
    (jobIds.length < 1 ||
      jobIds.length > 300 ||
      jobIds.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id,
          ),
      ))
  ) {
    throw new RangeError("Invalid outbox job identifiers.");
  }
  if (
    eventIds &&
    (eventIds.length < 1 ||
      eventIds.length > 300 ||
      eventIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(id)))
  ) {
    throw new RangeError("Invalid outbox event identifiers.");
  }
  const targetJobIds = jobIds ? `{${jobIds.join(",")}}` : null;
  const targetEventIds = eventIds ? eventIds : null;
  const rows = await getSqlClient().begin(
    (transaction) => transaction`
    WITH claimable AS (
      SELECT id
      FROM queue_outbox
      WHERE (
        status IN ('pending', 'failed')
        OR (status = 'sending' AND locked_at < now() - interval '2 minutes')
      )
        AND next_attempt_at <= now()
        AND (
          (${targetJobIds}::uuid[] IS NULL AND ${targetEventIds}::text[] IS NULL)
          OR job_id = ANY(${targetJobIds}::uuid[])
          OR event_id = ANY(${targetEventIds}::text[])
        )
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE queue_outbox AS event
    SET
      status = 'sending',
      locked_at = now(),
      attempt_count = event.attempt_count + 1,
      updated_at = now()
    FROM claimable
    WHERE event.id = claimable.id
    RETURNING
      event.id,
      event.job_id,
      event.event_id,
      event.event_name,
      event.payload,
      event.attempt_count
  `,
  );
  return rows.map((row) => ({
    attemptCount: row.attempt_count,
    eventId: row.event_id,
    eventName: row.event_name,
    id: row.id,
    jobId: row.job_id,
    payload: row.payload,
  }));
}

export async function markOutboxEventSent(eventId: string): Promise<void> {
  await getDatabase()
    .update(queueOutbox)
    .set({
      lastError: null,
      lockedAt: null,
      sentAt: new Date(),
      status: "sent",
    })
    .where(
      and(eq(queueOutbox.eventId, eventId), eq(queueOutbox.status, "sending")),
    );
}

export async function markOutboxEventFailed(input: {
  eventId: string;
  nextAttemptAt: Date;
  safeErrorCode: string;
}): Promise<void> {
  await getDatabase()
    .update(queueOutbox)
    .set({
      lastError: input.safeErrorCode.slice(0, 100),
      lockedAt: null,
      nextAttemptAt: input.nextAttemptAt,
      status: "failed",
    })
    .where(
      and(
        eq(queueOutbox.eventId, input.eventId),
        eq(queueOutbox.status, "sending"),
      ),
    );
}
