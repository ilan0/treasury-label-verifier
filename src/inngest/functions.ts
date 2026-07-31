import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { markJobFailed, processLabelJob } from "@/lib/server/jobs/processor";
import { dispatchPendingOutbox } from "@/lib/server/queue/outbox";
import {
  markApplicationExtractionFailed,
  processApplicationDocument,
} from "@/lib/server/applications/processor";
import { cleanupExpiredProofCheckData } from "@/lib/server/cleanup";

function providerStatus(reason: unknown): number | undefined {
  return typeof reason === "object" && reason !== null && "status" in reason
    ? Number((reason as { status: unknown }).status)
    : undefined;
}

export const verifyLabel = inngest.createFunction(
  {
    id: "verify-alcohol-label",
    name: "Verify alcohol label",
    concurrency: 5,
    retries: 3,
    triggers: { event: "label/verification.requested" },
    onFailure: async ({ event }) => {
      const jobId = (event.data.event.data as { jobId?: string }).jobId;
      if (jobId) await markJobFailed(jobId, event.data.error);
    },
  },
  async ({ event, step }) => {
    const jobId = (event.data as { jobId?: string }).jobId;
    if (!jobId) throw new NonRetriableError("JOB_ID_REQUIRED");
    try {
      return await step.run("process-label-job", () => processLabelJob(jobId));
    } catch (reason) {
      const status = providerStatus(reason);
      if (status && [400, 401, 403, 404].includes(status)) {
        await markJobFailed(jobId, reason);
        throw new NonRetriableError("PERMANENT_PROVIDER_FAILURE", {
          cause: reason,
        });
      }
      throw reason;
    }
  },
);

export const recoverOutbox = inngest.createFunction(
  {
    id: "recover-queue-outbox",
    retries: 2,
    triggers: { cron: "*/5 * * * *" },
  },
  async ({ step }) =>
    step.run("dispatch-pending-events", () =>
      dispatchPendingOutbox({ limit: 300 }),
    ),
);

export const extractApplication = inngest.createFunction(
  {
    id: "extract-application-document",
    name: "Extract application document",
    concurrency: 3,
    retries: 2,
    triggers: { event: "application/extraction.requested" },
    onFailure: async ({ event }) => {
      const applicationId = (
        event.data.event.data as { applicationId?: string }
      ).applicationId;
      if (applicationId) await markApplicationExtractionFailed(applicationId);
    },
  },
  async ({ event, step }) => {
    const applicationId = (event.data as { applicationId?: string })
      .applicationId;
    if (!applicationId) throw new NonRetriableError("APPLICATION_ID_REQUIRED");
    try {
      return await step.run("extract-application-document", () =>
        processApplicationDocument(applicationId),
      );
    } catch (reason) {
      const status = providerStatus(reason);
      if (status && [400, 401, 403, 404].includes(status)) {
        await markApplicationExtractionFailed(applicationId);
        throw new NonRetriableError("PERMANENT_PROVIDER_FAILURE", {
          cause: reason,
        });
      }
      throw reason;
    }
  },
);

export const cleanupExpiredData = inngest.createFunction(
  {
    id: "cleanup-expired-proofcheck-data",
    retries: 2,
    triggers: { cron: "17 * * * *" },
  },
  async ({ step }) =>
    step.run("cleanup-expired-data", () => cleanupExpiredProofCheckData()),
);

export const inngestFunctions = [
  verifyLabel,
  extractApplication,
  recoverOutbox,
  cleanupExpiredData,
];
