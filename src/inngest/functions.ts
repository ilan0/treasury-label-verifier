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

export const verifyInteractiveLabel = inngest.createFunction(
  {
    id: "verify-interactive-alcohol-label",
    name: "Verify interactive alcohol label",
    retries: 3,
    triggers: { event: "label/verification.interactive" },
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

export const verifyBulkLabel = inngest.createFunction(
  {
    id: "verify-bulk-alcohol-label",
    name: "Verify bulk alcohol label",
    concurrency: 4,
    retries: 3,
    triggers: { event: "label/verification.bulk" },
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

// Keep accepting the pre-optimization event name so an outbox row written by
// an in-flight older deployment cannot become stranded during rollout.
export const verifyLegacyLabel = inngest.createFunction(
  {
    id: "verify-legacy-alcohol-label",
    name: "Verify legacy alcohol label",
    concurrency: 1,
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
    return step.run("process-label-job", () => processLabelJob(jobId));
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
  verifyInteractiveLabel,
  verifyBulkLabel,
  verifyLegacyLabel,
  extractApplication,
  recoverOutbox,
  cleanupExpiredData,
];
