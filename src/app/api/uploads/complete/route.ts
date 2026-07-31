import {
  findApplicationForSession,
  registerArtifactForSession,
  updateApplicationDraftForSession,
} from "@/lib/server/dal";
import { dataResponse, errorResponse, jsonBody } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import {
  artifactExists,
  assertSessionStoragePath,
  downloadArtifact,
} from "@/lib/server/storage";
import { inspectArtifact } from "@/lib/server/uploads/inspect";
import { completeUploadsSchema } from "@/lib/validation/submission";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const body = completeUploadsSchema.parse(await jsonBody(request));
    const registered = [];
    for (const upload of body.uploads) {
      assertSessionStoragePath(upload.path, session.recordId);
      if (
        !upload.path.includes(`/batches/${body.batchId}/`) ||
        !upload.path.split("/").at(-1)?.startsWith(upload.id)
      )
        return Response.json(
          {
            error: "UPLOAD_TICKET_INVALID",
            message: "An upload ticket is invalid or expired.",
          },
          { status: 400 },
        );
      const applicationId = upload.applicationId ?? body.applicationId;
      if (!applicationId)
        return Response.json(
          {
            error: "FILE_MAPPING_ERROR",
            message: `${upload.name} has no application mapping.`,
          },
          { status: 400 },
        );
      const ownership = await findApplicationForSession(
        applicationId,
        session.recordId,
      );
      if (!ownership || ownership.application.batchId !== body.batchId)
        return Response.json(
          { error: "NOT_FOUND", message: "The upload target is unavailable." },
          { status: 404 },
        );
      if (!(await artifactExists(upload.path)))
        return Response.json(
          {
            error: "UPLOAD_INCOMPLETE",
            message: `${upload.name} did not finish uploading. Try that file again.`,
          },
          { status: 400 },
        );
      const blob = await downloadArtifact(upload.path);
      if (blob.size !== upload.size)
        return Response.json(
          {
            error: "UPLOAD_SIZE_MISMATCH",
            message: `${upload.name} was not uploaded completely.`,
          },
          { status: 400 },
        );
      const inspected = await inspectArtifact(
        Buffer.from(await blob.arrayBuffer()),
        {
          filename: upload.name,
          purpose: body.purpose,
        },
      );
      const artifact = await registerArtifactForSession({
        applicationId,
        batchId: body.batchId,
        height: inspected.height,
        mimeType: inspected.mimeType,
        panelType:
          body.purpose === "label_artwork"
            ? (upload.panelType ?? "other")
            : undefined,
        purpose: body.purpose,
        sessionId: session.recordId,
        sha256: inspected.sha256,
        sizeBytes: blob.size,
        storagePath: upload.path,
        width: inspected.width,
      });
      if (body.purpose === "application_document")
        await updateApplicationDraftForSession({
          applicationId,
          documentPath: upload.path,
          documentStatus: "queued",
          sessionId: session.recordId,
        });
      registered.push(artifact);
    }
    return dataResponse({ artifacts: registered });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
