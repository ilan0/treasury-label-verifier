import { findRule } from "@/lib/compliance";
import { getJobResultsForSession } from "@/lib/server/dal";
import { dataResponse, errorResponse } from "@/lib/server/http";
import { requireUserSession } from "@/lib/server/session";
import { createSignedArtifactDownload } from "@/lib/server/storage";
import { getDatabase } from "@/db/client";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

function flatObserved(fields: Record<string, unknown>) {
  const value = (key: string) => {
    const candidate = fields[key];
    return typeof candidate === "object" && candidate && "value" in candidate
      ? (candidate as { value?: unknown }).value
      : candidate;
  };
  return {
    ...fields,
    brandName: value("brandName"),
    classType: value("classType"),
    abv: value("alcoholByVolume"),
    netContents: value("netContents"),
    producerName: value("responsibleName"),
    producerAddress: value("responsibleAddress"),
    countryOfOrigin: value("countryOfOrigin"),
  };
}

function flatSubmitted(fields: Record<string, unknown>) {
  const party = (fields.responsibleParty ?? {}) as Record<string, unknown>;
  return {
    ...fields,
    abv: fields.alcoholByVolume,
    producerName: party.name,
    producerAddress: party.address,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await requireUserSession();
    const { jobId } = await context.params;
    const result = await getJobResultsForSession(jobId, session.recordId);
    if (!result)
      return Response.json(
        {
          error: "NOT_FOUND",
          message: "This review is unavailable or has expired.",
        },
        { status: 404 },
      );
    const artifactRows = await getDatabase()
      .select()
      .from(artifacts)
      .where(eq(artifacts.jobId, jobId));
    const submitted = result.application.submittedFields as {
      application?: Record<string, unknown>;
      artworkPath?: string;
    };
    const mappedArtifacts = await Promise.all(
      artifactRows.map(async (artifact) => ({
        ...artifact,
        signedUrl: await createSignedArtifactDownload(
          artifact.storagePath,
          120,
        ),
      })),
    );
    if (!mappedArtifacts.length && submitted.artworkPath)
      mappedArtifacts.push({
        id: `demo-${jobId}`,
        batchId: result.batch.id,
        applicationId: result.application.id,
        jobId,
        purpose: "label_artwork",
        panelType: "front",
        storagePath: submitted.artworkPath,
        mimeType: submitted.artworkPath.endsWith(".png")
          ? "image/png"
          : submitted.artworkPath.endsWith(".jpg")
            ? "image/jpeg"
            : "image/svg+xml",
        sizeBytes: 1,
        sha256: "demo",
        width: null,
        height: null,
        expiresAt: result.job.expiresAt,
        createdAt: result.job.createdAt,
        signedUrl: submitted.artworkPath,
      });
    const findings = result.results.map((finding) => {
      const definition = (() => {
        try {
          return findRule(finding.ruleId);
        } catch {
          return undefined;
        }
      })();
      return {
        ...finding,
        title: definition?.title,
        description: definition?.description,
        expected: finding.expectedValue,
        observed: finding.observedValue,
        citation: finding.sourceCitation,
      };
    });
    return dataResponse({
      job: result.job,
      batch: result.batch,
      application: {
        ...result.application,
        fields: flatSubmitted(submitted.application ?? submitted),
      },
      artifacts: mappedArtifacts,
      extraction: result.extraction
        ? {
            ...result.extraction,
            fields: flatObserved(result.extraction.fields),
            strategy: result.latestAttempt?.modelVariant,
            provenance: {
              cached: result.extraction.source === "cached_extraction",
              live: result.extraction.source === "openai",
              source: result.extraction.source,
              strategy: result.latestAttempt?.modelVariant,
            },
            timing: result.latestAttempt?.timingSpans,
          }
        : null,
      findings,
      history: result.events,
      decisions: result.decisions,
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
