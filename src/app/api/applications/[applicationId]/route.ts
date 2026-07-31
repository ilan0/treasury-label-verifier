import {
  confirmApplicationSchema,
  manualApplicationData,
} from "@/lib/validation/submission";
import {
  findApplicationForSession,
  updateApplicationDraftForSession,
} from "@/lib/server/dal";
import { dataResponse, errorResponse, jsonBody } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const session = await requireUserSession();
    const { applicationId } = await context.params;
    const record = await findApplicationForSession(
      applicationId,
      session.recordId,
    );
    if (!record)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This application draft is unavailable or has expired.",
        },
        { status: 404 },
      );
    return dataResponse(record);
  } catch (reason) {
    return errorResponse(reason, request);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { applicationId } = await context.params;
    const body = confirmApplicationSchema.parse(await jsonBody(request));
    const application = manualApplicationData(body.fields);
    const updated = await updateApplicationDraftForSession({
      applicationId,
      confirmed: true,
      documentStatus: "confirmed",
      expectedUpdatedAt: body.expectedUpdatedAt
        ? new Date(body.expectedUpdatedAt)
        : undefined,
      originType: body.fields.imported ? "imported" : "domestic",
      regulatoryProfile: application.profile,
      sessionId: session.recordId,
      submittedFields: {
        application,
        source: "application_document_confirmed",
      },
    });
    return dataResponse({ application: updated });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
