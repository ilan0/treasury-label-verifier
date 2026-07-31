import {
  createBatchDraft,
  listApplicationsForBatchSession,
  submitBatchForSession,
} from "@/lib/server/dal";
import { acceptedResponse, errorResponse, jsonBody } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  clientIpHash,
  getOrCreateUserSession,
} from "@/lib/server/session";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import {
  benchmarkScenarios,
  demoScenarioIds,
  getDemoScenario,
} from "@/lib/demo/scenarios";
import { RULESET_VERSION } from "@/lib/domain";
import { demoRequestSchema } from "@/lib/validation/submission";
import { after } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await getOrCreateUserSession();
    const body = demoRequestSchema.parse(await jsonBody(request));
    const scenarioId = body.scenarioId ?? body.scenario;
    if (!scenarioId || !demoScenarioIds.includes(scenarioId as never))
      return Response.json(
        {
          error: "UNKNOWN_SCENARIO",
          message: "Choose one of the available examples.",
        },
        { status: 400 },
      );
    const isBenchmark = scenarioId === "batch-250";
    const scenarios = isBenchmark
      ? benchmarkScenarios(250)
      : [getDemoScenario(scenarioId)].filter(Boolean);
    const idempotencyKey =
      request.headers.get("idempotency-key")?.slice(0, 200) || undefined;
    const batch = await createBatchDraft({
      sessionId: session.recordId,
      idempotencyKey,
      mode: isBenchmark ? "benchmark" : "demo",
      name: isBenchmark ? "250-item user benchmark" : scenarios[0]!.title,
      applications: scenarios.map((scenario, index) => ({
        externalId: isBenchmark
          ? `BENCH-${String(index + 1).padStart(3, "0")}`
          : "DEMO-001",
        regulatoryProfile: scenario!.application.profile,
        originType: scenario!.application.declarations?.imported
          ? "imported"
          : "domestic",
        confirmed: true,
        submittedFields: {
          application: scenario!.application,
          artworkPath: scenario!.artworkPath,
          ...(isBenchmark ? { demoObservation: scenario!.observation } : {}),
          ...(!isBenchmark && scenario!.warningTypeSizeMm
            ? { warningTypeSizeMm: scenario!.warningTypeSizeMm }
            : {}),
          demoScenarioId: scenario!.id,
        },
      })),
    });
    const submitted = await submitBatchForSession({
      batchId: batch.id,
      quota: isBenchmark
        ? undefined
        : {
            globalLimit: Number(process.env.MAX_LIVE_DEMOS_GLOBAL_DAY ?? 100),
            ipHash: clientIpHash(request),
            ipLimit: Number(process.env.MAX_LIVE_DEMOS_PER_IP_DAY ?? 20),
            kind: "live_demo_model_job",
            sessionLimit: Number(
              process.env.MAX_LIVE_DEMOS_PER_SESSION_DAY ?? 20,
            ),
            units: 1,
          },
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
          .where(eq(labelJobs.batchId, batch.id))
      ).map((item) => item.id);
    }
    after(() => dispatchPendingOutbox({ jobIds }));
    const queue = { delivered: 0, pending: jobIds.length };
    const applications = await listApplicationsForBatchSession(
      batch.id,
      session.recordId,
    );
    return acceptedResponse({
      batchId: batch.id,
      jobId: jobIds.length === 1 ? jobIds[0] : undefined,
      kind: isBenchmark ? "benchmark" : "single",
      applicationId:
        applications.length === 1 ? applications[0].application.id : undefined,
      queue,
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
