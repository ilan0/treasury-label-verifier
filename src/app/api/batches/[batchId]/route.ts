import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { applications, labelJobs } from "@/db/schema";
import {
  deleteBatchForSession,
  getBatchSummaryForSession,
  listArtifactPathsForBatchSession,
} from "@/lib/server/dal";
import { dataResponse, errorResponse } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";
import { deleteArtifacts } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const session = await requireUserSession();
    const { batchId } = await context.params;
    const batch = await getBatchSummaryForSession(batchId, session.recordId);
    if (!batch)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This batch is unavailable or has expired.",
        },
        { status: 404 },
      );
    const jobs = await getDatabase()
      .select({ application: applications, job: labelJobs })
      .from(labelJobs)
      .innerJoin(applications, eq(labelJobs.applicationId, applications.id))
      .where(
        and(eq(labelJobs.batchId, batchId), eq(applications.batchId, batchId)),
      )
      .orderBy(asc(applications.externalId));
    const mapped = jobs.map(({ application, job }) => {
      const submitted = application.submittedFields as Record<
        string,
        unknown
      > & { application?: Record<string, unknown> };
      const fields: Record<string, unknown> =
        submitted.application ?? submitted;
      return {
        ...job,
        externalId: application.externalId,
        profile: application.regulatoryProfile,
        brandName: fields.brandName,
        classType: fields.classType,
      };
    });
    const aggregates = {
      total: batch.totalCount,
      completed: mapped.filter((item) =>
        [
          "completed",
          "review_required",
          "correction_needed",
          "failed",
          "rejected",
          "cancelled",
          "expired",
        ].includes(item.status),
      ).length,
      precheckPassed: mapped.filter(
        (item) => item.outcome === "precheck_passed",
      ).length,
      reviewRequired: mapped.filter(
        (item) => item.outcome === "human_review_required",
      ).length,
      correctionNeeded: mapped.filter(
        (item) => item.outcome === "correction_needed",
      ).length,
      failed: mapped.filter((item) =>
        ["failed", "rejected"].includes(item.status),
      ).length,
      cancelled: mapped.filter((item) => item.status === "cancelled").length,
    };
    return dataResponse({
      batch,
      jobs: mapped,
      aggregates,
      pagination: { total: mapped.length, nextCursor: null },
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { batchId } = await context.params;
    const artifacts = await listArtifactPathsForBatchSession(
      batchId,
      session.recordId,
    );
    for (let offset = 0; offset < artifacts.length; offset += 100)
      await deleteArtifacts(
        artifacts.slice(offset, offset + 100).map((item) => item.storagePath),
      );
    await deleteBatchForSession(batchId, session.recordId);
    return dataResponse({ deleted: true, batchId });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
