import { randomUUID } from "node:crypto";

import {
  findApplicationForSession,
  findBatchForSession,
  listApplicationsForBatchSession,
} from "@/lib/server/dal";
import { dataResponse, errorResponse, jsonBody } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import {
  buildArtifactStoragePath,
  createSignedArtifactUpload,
  validateArtifactMetadata,
} from "@/lib/server/storage";
import { declaredMimeType } from "@/lib/server/uploads/inspect";
import {
  acceptedApplicationTypes,
  acceptedArtworkTypes,
  MAX_BATCH_BYTES,
  signUploadsSchema,
} from "@/lib/validation/submission";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const body = signUploadsSchema.parse(await jsonBody(request));
    const batch = await findBatchForSession(body.batchId, session.recordId);
    if (!batch)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This draft is unavailable or has expired.",
        },
        { status: 404 },
      );
    if (batch.status !== "draft")
      return Response.json(
        {
          error: "INVALID_STATE",
          message: "Files can no longer be added to this batch.",
        },
        { status: 409 },
      );
    if (
      body.files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES
    )
      throw new RangeError("A batch may contain at most 300 MB of files.");

    const applications = await listApplicationsForBatchSession(
      body.batchId,
      session.recordId,
    );
    const allowedTypes =
      body.purpose === "label_artwork"
        ? acceptedArtworkTypes
        : acceptedApplicationTypes;
    const uploads = [];
    for (const file of body.files) {
      const mimeType = declaredMimeType(file.name, file.type);
      if (!(allowedTypes as readonly string[]).includes(mimeType))
        return Response.json(
          {
            error: "UNSUPPORTED_FILE",
            message: `${file.name} is not a supported file type.`,
          },
          { status: 400 },
        );
      validateArtifactMetadata({ mimeType, sizeBytes: file.size });

      let applicationId = body.applicationId;
      let panelType = file.panelType;
      if (!applicationId) {
        const matches = applications.filter(({ application }) => {
          const submitted = application.submittedFields as {
            artwork?: Array<{
              filename?: string;
              panelType?: typeof panelType;
            }>;
          };
          return submitted.artwork?.some((item) => item.filename === file.name);
        });
        if (matches.length !== 1)
          return Response.json(
            {
              error: "FILE_MAPPING_ERROR",
              message: `${file.name} does not map uniquely to one manifest application.`,
            },
            { status: 400 },
          );
        applicationId = matches[0].application.id;
        const submitted = matches[0].application.submittedFields as {
          artwork?: Array<{ filename?: string; panelType?: typeof panelType }>;
        };
        panelType = submitted.artwork?.find(
          (item) => item.filename === file.name,
        )?.panelType;
      }
      const ownership = await findApplicationForSession(
        applicationId,
        session.recordId,
      );
      if (!ownership || ownership.application.batchId !== body.batchId)
        return Response.json(
          { error: "NOT_FOUND", message: "The upload target is unavailable." },
          { status: 404 },
        );

      const artifactId = randomUUID();
      const path = buildArtifactStoragePath({
        artifactId,
        batchId: body.batchId,
        fileName: file.name,
        sessionRecordId: session.recordId,
      });
      const signed = await createSignedArtifactUpload(path);
      uploads.push({
        ...signed,
        id: artifactId,
        applicationId,
        panelType:
          body.purpose === "label_artwork" ? (panelType ?? "other") : undefined,
        mimeType,
      });
    }
    return dataResponse({ uploads });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
