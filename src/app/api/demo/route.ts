import { createAndSubmitDemoBatch } from "@/lib/server/dal";
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
    const submitted = await createAndSubmitDemoBatch({
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
          artworkPath:
            body.performanceVariant && scenario!.id === "compliant-bourbon"
              ? `/demo/performance/old-tom-${String(body.performanceVariant).padStart(2, "0")}.jpg`
              : scenario!.artworkPath,
          ...(isBenchmark ? { demoObservation: scenario!.observation } : {}),
          ...(!isBenchmark && scenario!.warningTypeSizeMm
            ? { warningTypeSizeMm: scenario!.warningTypeSizeMm }
            : {}),
          demoScenarioId: scenario!.id,
        },
      })),
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
    });
    const jobIds = submitted.jobIds;
    const queueDelivery = dispatchPendingOutbox({ jobIds });
    after(() => queueDelivery);
    const queue = { delivered: 0, pending: jobIds.length };
    return acceptedResponse({
      batchId: submitted.batchId,
      jobId: jobIds.length === 1 ? jobIds[0] : undefined,
      kind: isBenchmark ? "benchmark" : "single",
      applicationId:
        submitted.applicationIds.length === 1
          ? submitted.applicationIds[0]
          : undefined,
      queue,
    });
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
