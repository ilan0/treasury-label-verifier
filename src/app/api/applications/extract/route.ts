import { getDatabase } from "@/db/client";
import { queueOutbox } from "@/db/schema";
import {
  findApplicationForSession,
  updateApplicationDraftForSession,
} from "@/lib/server/dal";
import { acceptedResponse, errorResponse, jsonBody } from "@/lib/server/http";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import { z } from "zod";
import { after } from "next/server";

const requestSchema = z.object({
  batchId: z.string().uuid(),
  applicationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const body = requestSchema.parse(await jsonBody(request));
    const record = await findApplicationForSession(
      body.applicationId,
      session.recordId,
    );
    if (!record || record.application.batchId !== body.batchId)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This application draft is unavailable.",
        },
        { status: 404 },
      );
    if (!record.application.documentPath)
      return Response.json(
        {
          error: "DOCUMENT_REQUIRED",
          message: "Upload the application document before extracting it.",
        },
        { status: 400 },
      );
    await updateApplicationDraftForSession({
      applicationId: body.applicationId,
      documentStatus: "queued",
      sessionId: session.recordId,
    });
    await getDatabase()
      .insert(queueOutbox)
      .values({
        eventId: `application-extraction-${body.applicationId}`,
        eventName: "application/extraction.requested",
        payload: { applicationId: body.applicationId },
      })
      .onConflictDoNothing({ target: queueOutbox.eventId });
    after(() =>
      dispatchPendingOutbox({
        eventIds: [`application-extraction-${body.applicationId}`],
        limit: 1,
      }),
    );
    const queue = { delivered: 0, pending: 1 };
    return acceptedResponse({
      applicationId: body.applicationId,
      status: "queued",
      queue,
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
