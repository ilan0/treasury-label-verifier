import { RULESET_VERSION } from "@/lib/domain";
import {
  findBatchForSession,
  listApplicationsForBatchSession,
  listArtifactsForApplicationSession,
  submitBatchForSession,
} from "@/lib/server/dal";
import { acceptedResponse, errorResponse } from "@/lib/server/http";
import {
  clientIpHash,
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import { after } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { batchId } = await context.params;
    const batch = await findBatchForSession(batchId, session.recordId);
    if (!batch)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This batch is unavailable or has expired.",
        },
        { status: 404 },
      );
    const applicationRows = await listApplicationsForBatchSession(
      batchId,
      session.recordId,
    );
    for (const { application } of applicationRows) {
      const submitted = application.submittedFields as {
        demoObservation?: unknown;
      };
      if (!submitted.demoObservation) {
        const artifactRows = await listArtifactsForApplicationSession(
          application.id,
          session.recordId,
        );
        if (
          !artifactRows.some((row) => row.artifact.purpose === "label_artwork")
        )
          throw new Error("ARTWORK_REQUIRED");
      }
    }
    const quota = !["demo", "benchmark"].includes(batch.mode)
      ? {
          globalLimit: Number(process.env.MAX_LIVE_JOBS_GLOBAL_DAY ?? 1000),
          ipHash: clientIpHash(request),
          ipLimit: Number(process.env.MAX_LIVE_JOBS_PER_IP_DAY ?? 300),
          kind: "live_model_job",
          sessionLimit: Number(
            process.env.MAX_LIVE_JOBS_PER_SESSION_DAY ?? 300,
          ),
          units: applicationRows.length,
        }
      : undefined;
    const submitted = await submitBatchForSession({
      batchId,
      quota,
      rulesetVersion: RULESET_VERSION,
      sessionId: session.recordId,
    });
    let jobIds = submitted.jobIds;
    if (submitted.alreadySubmitted) {
      const { getDatabase } = await import("@/db/client");
      const { labelJobs } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      jobIds = (
        await getDatabase()
          .select({ id: labelJobs.id })
          .from(labelJobs)
          .where(eq(labelJobs.batchId, batchId))
      ).map((item) => item.id);
    }
    const queueDelivery = dispatchPendingOutbox({ jobIds });
    after(() => queueDelivery);
    const queue = { delivered: 0, pending: jobIds.length };
    return acceptedResponse({
      batchId,
      jobIds,
      jobId: jobIds.length === 1 ? jobIds[0] : undefined,
      queue,
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
