import { findJobForSession, recordReviewDecision } from "@/lib/server/dal";
import { dataResponse, errorResponse, jsonBody } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import { reviewRequestSchema } from "@/lib/validation/submission";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { jobId } = await context.params;
    const body = reviewRequestSchema.parse(await jsonBody(request));
    if (body.decision !== "confirmed_clear" && (body.notes?.length ?? 0) < 10)
      return Response.json(
        {
          error: "RATIONALE_REQUIRED",
          message: "Add at least 10 characters explaining this decision.",
        },
        { status: 400 },
      );
    const decision = await recordReviewDecision({
      decision: body.decision,
      expectedReviewVersion: body.reviewVersion,
      jobId,
      notes: body.notes,
      overrides: body.overrides,
      sessionId: session.recordId,
    });
    const record = await findJobForSession(jobId, session.recordId);
    return dataResponse({ decision, job: record?.job });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
