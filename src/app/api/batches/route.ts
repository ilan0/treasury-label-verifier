import {
  createBatchSchema,
  manualApplicationData,
  parseManifest,
} from "@/lib/validation/submission";
import {
  createBatchDraft,
  listApplicationsForBatchSession,
} from "@/lib/server/dal";
import {
  assertSameOriginMutation,
  getOrCreateUserSession,
} from "@/lib/server/session";
import { dataResponse, errorResponse, jsonBody } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await getOrCreateUserSession();
    const body = createBatchSchema.parse(await jsonBody(request));
    const idempotencyKey =
      request.headers.get("idempotency-key")?.slice(0, 200) || undefined;
    let draftApplications;
    if (body.mode === "batch") {
      if (!body.manifest) throw new Error("CSV_EMPTY");
      draftApplications = parseManifest(body.manifest.text).map((item) => ({
        externalId: item.externalId,
        regulatoryProfile: item.application.profile,
        originType: item.application.declarations?.imported
          ? ("imported" as const)
          : ("domestic" as const),
        confirmed: true,
        submittedFields: {
          application: item.application,
          artwork: item.artwork,
        },
      }));
    } else if (body.application) {
      const application = manualApplicationData(body.application.fields);
      draftApplications = [
        {
          externalId: "APP-001",
          regulatoryProfile: application.profile,
          originType: body.application.originType,
          confirmed: true,
          submittedFields: { application },
        },
      ];
    } else {
      draftApplications = [
        {
          externalId: "APP-001",
          regulatoryProfile: "classification_review" as const,
          originType: "unknown" as const,
          confirmed: false,
          submittedFields: { draft: {}, source: "application_document" },
        },
      ];
    }

    const batch = await createBatchDraft({
      applications: draftApplications,
      idempotencyKey,
      mode: body.mode,
      name: body.name,
      sessionId: session.recordId,
    });
    const applicationRows = await listApplicationsForBatchSession(
      batch.id,
      session.recordId,
    );
    return dataResponse(
      {
        batch,
        batchId: batch.id,
        applicationId:
          applicationRows.length === 1
            ? applicationRows[0].application.id
            : undefined,
        applications: applicationRows.map((row) => row.application),
      },
      { status: 201 },
    );
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
