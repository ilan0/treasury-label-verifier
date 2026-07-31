import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  applications,
  artifacts,
  batches,
  extractions,
  labelJobs,
  ruleResults,
  statusEvents,
  type JsonObject,
} from "@/db/schema";
import { evaluateCompliance } from "@/lib/compliance";
import type {
  ApplicationData,
  ComplianceAssessment,
  LabelObservation,
  RuleSeverity,
} from "@/lib/domain";
import { RULESET_VERSION } from "@/lib/domain";
import { volumeInMilliliters } from "@/lib/matching";
import { InvalidRecordStateError } from "@/lib/server/dal";
import {
  persistJobEvaluation,
  reconcileBatchStatus,
  transitionJobStatus,
} from "@/lib/server/dal";
import {
  extractLabelArtwork,
  type ArtworkInput,
} from "@/lib/server/openai/extract";
import {
  APPLICATION_PROMPT_VERSION,
  LABEL_PROMPT_VERSION,
  OPENAI_MODEL,
} from "@/lib/server/openai/client";
import { asDataUrl, normalizeArtwork } from "@/lib/server/preprocess/image";
import { downloadArtifact } from "@/lib/server/storage";

const terminalStatuses = new Set([
  "completed",
  "review_required",
  "correction_needed",
  "rejected",
  "failed",
  "cancelled",
  "expired",
]);

function databaseSeverity(severity: RuleSeverity) {
  if (severity === "mandatory") return "error" as const;
  if (severity === "conditional") return "warning" as const;
  return "information" as const;
}

async function jobContext(jobId: string) {
  const db = getDatabase();
  const [record] = await db
    .select({ application: applications, batch: batches, job: labelJobs })
    .from(labelJobs)
    .innerJoin(applications, eq(labelJobs.applicationId, applications.id))
    .innerJoin(batches, eq(labelJobs.batchId, batches.id))
    .where(eq(labelJobs.id, jobId))
    .limit(1);
  if (!record) throw new Error("JOB_NOT_FOUND");
  const artwork = await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.jobId, jobId), eq(artifacts.purpose, "label_artwork")),
    )
    .orderBy(asc(artifacts.createdAt));
  const [extraction] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.jobId, jobId))
    .limit(1);
  return { ...record, artwork, extraction: extraction ?? null };
}

function submittedData(fields: JsonObject) {
  const application = (fields.application ?? fields) as ApplicationData;
  const demoObservation = fields.demoObservation as
    LabelObservation | undefined;
  const artworkPath =
    typeof fields.artworkPath === "string" ? fields.artworkPath : undefined;
  const warningTypeSizeMm =
    typeof fields.warningTypeSizeMm === "number"
      ? fields.warningTypeSizeMm
      : undefined;
  return { application, artworkPath, demoObservation, warningTypeSizeMm };
}

async function buildStaticDemoArtwork(path: string): Promise<ArtworkInput> {
  if (!/^\/demo\/[a-z0-9-]+\.png$/.test(path))
    throw new Error("INVALID_DEMO_ARTWORK");
  const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelHost = process.env.VERCEL_URL?.trim();
  const base =
    configuredBase ||
    (vercelHost ? `https://${vercelHost}` : "http://127.0.0.1:3000");
  const response = await fetch(new URL(path, base), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("DEMO_ARTWORK_UNAVAILABLE");
  const raw = Buffer.from(await response.arrayBuffer());
  if (!raw.length || raw.length > 10 * 1024 * 1024)
    throw new Error("INVALID_DEMO_ARTWORK");
  const normalized = await normalizeArtwork(raw);
  return {
    dataUrl: asDataUrl(normalized.buffer, normalized.mimeType),
    // User demos are clean, print-style artwork. High detail preserves the
    // warning text while avoiding the latency/cost of original-detail bottle
    // photography. Custom single-image evidence remains original detail.
    detail: "high",
    filename: path.split("/").at(-1),
    mimeType: normalized.mimeType,
    panel: "front",
  };
}

async function buildArtworkInputs(
  artwork: Array<typeof artifacts.$inferSelect>,
): Promise<ArtworkInput[]> {
  return Promise.all(
    artwork.map(async (artifact) => {
      const blob = await downloadArtifact(artifact.storagePath);
      const raw = Buffer.from(await blob.arrayBuffer());
      if (artifact.mimeType === "application/pdf") {
        return {
          dataUrl: asDataUrl(raw, "application/pdf"),
          filename:
            artifact.storagePath.split("/").at(-1) ?? "label-artwork.pdf",
          mimeType: "application/pdf",
          panel: artifact.panelType ?? "other",
          detail: "high",
        };
      }
      const normalized = await normalizeArtwork(raw);
      return {
        dataUrl: asDataUrl(normalized.buffer, normalized.mimeType),
        filename: artifact.storagePath.split("/").at(-1),
        mimeType: normalized.mimeType,
        panel: artifact.panelType ?? "other",
        detail: artwork.length === 1 ? "original" : "high",
      };
    }),
  );
}

function terminalStatus(assessment: ComplianceAssessment) {
  if (assessment.outcome === "precheck_passed") return "completed" as const;
  if (assessment.outcome === "correction_needed")
    return "correction_needed" as const;
  return "review_required" as const;
}

async function processCachedDemo(input: {
  application: ApplicationData;
  batchId: string;
  jobId: string;
  observation: LabelObservation;
}) {
  const assessment = evaluateCompliance(input.application, input.observation);
  const finalStatus = terminalStatus(assessment);
  const model = "validated-demo-fixture";
  const promptVersion = "demo-fixture.2026-07-31.1";
  const result = await getDatabase().transaction(async (transaction) => {
    // The lock makes fixture replay and duplicate event delivery harmless.
    const locked = await transaction.execute(sql`
      SELECT status, attempt_count, started_at
      FROM label_jobs WHERE id = ${input.jobId} FOR UPDATE
    `);
    const current = locked[0] as
      | { attempt_count: number; started_at: Date | null; status: string }
      | undefined;
    if (!current) throw new Error("JOB_NOT_FOUND");
    if (terminalStatuses.has(current.status))
      return { replay: true, status: current.status };

    const progression = ["queued", "validating", "extracting", "verifying"];
    const currentIndex = Math.max(0, progression.indexOf(current.status));
    const events: Array<typeof statusEvents.$inferInsert> = progression
      .slice(currentIndex + 1)
      .map((nextStatus, index) => ({
        details: { source: "cached_demo" },
        fromStatus: progression[currentIndex + index] as
          "queued" | "validating" | "extracting" | "verifying",
        jobId: input.jobId,
        toStatus: nextStatus as "validating" | "extracting" | "verifying",
      }));
    events.push({
      details: { source: "cached_demo" },
      fromStatus: "verifying",
      jobId: input.jobId,
      toStatus: finalStatus,
    });
    await transaction.insert(statusEvents).values(events);
    await transaction
      .insert(extractions)
      .values({
        confidence: input.observation.overallConfidence,
        fields: input.observation as unknown as JsonObject,
        imageQuality: {
          good: 1,
          fair: 0.75,
          poor: 0.4,
          unreadable: 0,
        }[input.observation.imageQuality ?? "fair"],
        jobId: input.jobId,
        latencyMs: 0,
        model,
        promptVersion,
        source: "cached_demo",
        usage: {},
      })
      .onConflictDoNothing();
    await transaction
      .insert(ruleResults)
      .values(
        assessment.results.map((item) => ({
          confidence: item.confidence ?? undefined,
          evidence: item.evidencePanel ? { panel: item.evidencePanel } : {},
          expectedValue: item.expected,
          explanation: item.explanation,
          jobId: input.jobId,
          observedValue: item.observed,
          ruleId: item.ruleId,
          severity: databaseSeverity(item.severity),
          sourceCitation: item.citation as unknown as JsonObject,
          status: item.status,
        })),
      )
      .onConflictDoUpdate({
        target: [ruleResults.jobId, ruleResults.ruleId],
        set: {
          confidence: sql`excluded.confidence`,
          evidence: sql`excluded.evidence`,
          expectedValue: sql`excluded.expected_value`,
          explanation: sql`excluded.explanation`,
          observedValue: sql`excluded.observed_value`,
          severity: sql`excluded.severity`,
          sourceCitation: sql`excluded.source_citation`,
          status: sql`excluded.status`,
        },
      });
    await transaction
      .update(labelJobs)
      .set({
        attemptCount: current.attempt_count + 1,
        completedAt: new Date(),
        confidence: assessment.overallConfidence,
        errorCode: null,
        errorMessage: null,
        latencyMs: 0,
        model,
        outcome: assessment.outcome,
        promptVersion,
        rulesetVersion: RULESET_VERSION,
        startedAt: current.started_at ?? new Date(),
        status: finalStatus,
      })
      .where(eq(labelJobs.id, input.jobId));
    return { outcome: assessment.outcome, replay: false, status: finalStatus };
  });
  await reconcileBatchStatus(input.batchId);
  return result;
}

async function persistAssessment(input: {
  assessment: ComplianceAssessment;
  jobId: string;
  latencyMs: number;
  model: string;
  observation: LabelObservation;
  promptVersion: string;
  rawText?: string;
  source: "openai" | "cached_demo";
  usage?: JsonObject;
}) {
  return persistJobEvaluation({
    jobId: input.jobId,
    extraction: {
      confidence: input.observation.overallConfidence,
      fields: input.observation as unknown as JsonObject,
      imageQuality: {
        good: 1,
        fair: 0.75,
        poor: 0.4,
        unreadable: 0,
      }[input.observation.imageQuality ?? "fair"],
      latencyMs: input.latencyMs,
      model: input.model,
      promptVersion: input.promptVersion,
      rawText: input.rawText,
      source: input.source,
      usage: input.usage,
    },
    job: {
      confidence: input.assessment.overallConfidence,
      latencyMs: input.latencyMs,
      model: input.model,
      outcome: input.assessment.outcome,
      promptVersion: input.promptVersion,
      terminalStatus: terminalStatus(input.assessment),
    },
    results: input.assessment.results.map((result) => ({
      confidence: result.confidence ?? undefined,
      evidence: result.evidencePanel ? { panel: result.evidencePanel } : {},
      expectedValue: result.expected,
      explanation: result.explanation,
      observedValue: result.observed,
      ruleId: result.ruleId,
      severity: databaseSeverity(result.severity),
      sourceCitation: result.citation as unknown as JsonObject,
      status: result.status,
    })),
  });
}

export async function processLabelJob(jobId: string) {
  let context = await jobContext(jobId);
  if (terminalStatuses.has(context.job.status))
    return { status: context.job.status, replay: true };

  if (context.batch.status === "cancelled") {
    await transitionJobStatus({
      jobId,
      expectedStatuses: [context.job.status],
      nextStatus: "cancelled",
      patch: { completedAt: new Date() },
      details: { source: "worker_cancellation_check" },
    });
    await reconcileBatchStatus(context.job.batchId);
    return { status: "cancelled" };
  }

  const initialSubmitted = submittedData(context.application.submittedFields);
  if (initialSubmitted.demoObservation) {
    if (
      !initialSubmitted.application?.profile ||
      !initialSubmitted.application?.brandName
    )
      throw new Error("INVALID_APPLICATION");
    return processCachedDemo({
      application: initialSubmitted.application,
      batchId: context.job.batchId,
      jobId,
      observation: initialSubmitted.demoObservation,
    });
  }

  if (context.job.status === "queued") {
    await transitionJobStatus({
      jobId,
      expectedStatuses: ["queued"],
      nextStatus: "validating",
      patch: {
        attemptCount: context.job.attemptCount + 1,
        startedAt: context.job.startedAt ?? new Date(),
      },
    });
    context = await jobContext(jobId);
  }

  const { application, artworkPath, demoObservation, warningTypeSizeMm } =
    submittedData(context.application.submittedFields);
  if (!application?.profile || !application?.brandName) {
    await transitionJobStatus({
      jobId,
      expectedStatuses: [context.job.status],
      nextStatus: "rejected",
      patch: {
        completedAt: new Date(),
        errorCode: "INVALID_APPLICATION",
        errorMessage: "The confirmed application data is incomplete.",
      },
    });
    await reconcileBatchStatus(context.job.batchId);
    return { status: "rejected" };
  }

  if (context.job.status === "validating") {
    if (!demoObservation && !artworkPath && context.artwork.length === 0) {
      await transitionJobStatus({
        jobId,
        expectedStatuses: ["validating"],
        nextStatus: "rejected",
        patch: {
          completedAt: new Date(),
          errorCode: "ARTWORK_REQUIRED",
          errorMessage: "No registered label artwork is available.",
        },
      });
      await reconcileBatchStatus(context.job.batchId);
      return { status: "rejected" };
    }
    await transitionJobStatus({
      jobId,
      expectedStatuses: ["validating"],
      nextStatus: "extracting",
    });
    context = await jobContext(jobId);
  }

  let observation: LabelObservation;
  let rawText: string | undefined;
  let model = OPENAI_MODEL;
  let promptVersion = LABEL_PROMPT_VERSION;
  let source: "openai" | "cached_demo" = "openai";
  let latencyMs = 0;
  let usage: JsonObject = {};

  if (context.extraction) {
    observation = context.extraction.fields as unknown as LabelObservation;
    rawText = context.extraction.rawText ?? undefined;
    model = context.extraction.model;
    promptVersion = context.extraction.promptVersion;
    source = context.extraction.source;
    latencyMs = context.extraction.latencyMs;
    usage = context.extraction.usage;
  } else if (demoObservation) {
    observation = demoObservation;
    model = "validated-demo-fixture";
    promptVersion = "demo-fixture.2026-07-31.1";
    source = "cached_demo";
  } else {
    const artworkInputs = context.artwork.length
      ? await buildArtworkInputs(context.artwork)
      : [await buildStaticDemoArtwork(artworkPath!)];
    const extracted = await extractLabelArtwork(artworkInputs);
    observation = extracted.observation;
    if (artworkPath && warningTypeSizeMm && observation.healthWarning) {
      observation = {
        ...observation,
        healthWarning: {
          ...observation.healthWarning,
          containerVolumeMl: volumeInMilliliters(application.netContents),
          measuredTypeSizeMm: warningTypeSizeMm,
        },
      };
    }
    if (
      artworkPath &&
      application.profile === "faa_distilled_spirits" &&
      observation.brandName?.value &&
      observation.classType?.value &&
      observation.alcoholByVolume?.value !== null &&
      observation.alcoholByVolume?.value !== undefined
    ) {
      observation = {
        ...observation,
        sameFieldOfVision: { brandClassAlcohol: true },
      };
    }
    rawText = extracted.extraction.rawText;
    model = extracted.model;
    promptVersion = extracted.promptVersion;
    latencyMs = extracted.latencyMs;
    usage = extracted.usage as unknown as JsonObject;
  }

  if (context.job.status === "extracting") {
    await getDatabase()
      .insert(extractions)
      .values({
        confidence: observation.overallConfidence,
        fields: observation as unknown as JsonObject,
        imageQuality: {
          good: 1,
          fair: 0.75,
          poor: 0.4,
          unreadable: 0,
        }[observation.imageQuality ?? "fair"],
        jobId,
        latencyMs,
        model,
        promptVersion,
        rawText,
        source,
        usage,
      })
      .onConflictDoNothing();
    await transitionJobStatus({
      jobId,
      expectedStatuses: ["extracting"],
      nextStatus: "verifying",
      patch: {
        latencyMs,
        model,
        promptVersion,
        rulesetVersion: RULESET_VERSION,
      },
    });
  }

  const assessment = evaluateCompliance(application, observation);
  await persistAssessment({
    assessment,
    jobId,
    latencyMs,
    model,
    observation,
    promptVersion,
    rawText,
    source,
    usage,
  });
  await reconcileBatchStatus(context.job.batchId);
  return { outcome: assessment.outcome, status: terminalStatus(assessment) };
}

export async function markJobFailed(jobId: string, reason: unknown) {
  const context = await jobContext(jobId).catch(() => null);
  if (!context || terminalStatuses.has(context.job.status)) return;
  const message = reason instanceof Error ? reason.message : "UNKNOWN_FAILURE";
  await transitionJobStatus({
    jobId,
    expectedStatuses: [context.job.status],
    nextStatus: "failed",
    patch: {
      completedAt: new Date(),
      errorCode: /timeout/i.test(message)
        ? "PROVIDER_TIMEOUT"
        : "PROCESSING_FAILED",
      errorMessage:
        "Processing could not be completed after retrying. The item can be retried.",
    },
    details: { source: "worker_failure" },
  }).catch((error) => {
    if (!(error instanceof InvalidRecordStateError)) throw error;
  });
  await reconcileBatchStatus(context.job.batchId);
}

export { APPLICATION_PROMPT_VERSION };
