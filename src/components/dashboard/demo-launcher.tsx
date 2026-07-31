"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowIcon, BatchIcon, SparkIcon } from "@/components/ui/icons";

type DemoResponse = {
  batchId?: string;
  jobId?: string;
  id?: string;
  data?: DemoResponse;
  batch?: { id?: string };
  job?: { id?: string };
};

function ids(payload: DemoResponse) {
  const source = payload.data ?? payload;
  return {
    batchId: source.batchId ?? source.batch?.id,
    jobId:
      source.jobId ??
      source.job?.id ??
      (source.batchId ? undefined : source.id),
  };
}

export function DemoLauncher({
  scenario,
  label,
  appearance = "primary",
  icon = "spark",
}: {
  scenario: string;
  label: string;
  appearance?: "primary" | "secondary" | "text";
  icon?: "spark" | "batch";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function launch() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ scenario, scenarioId: scenario }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as DemoResponse & {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            payload.error ??
            "The example could not be started.",
        );
      const { batchId, jobId } = ids(payload);
      if (scenario === "batch-250" && batchId)
        router.push(`/batches/${batchId}`);
      else if (jobId) router.push(`/reviews/${jobId}`);
      else if (batchId) router.push(`/batches/${batchId}`);
      else throw new Error("The server did not return an example ID.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The example could not be started.",
      );
      setBusy(false);
    }
  }

  const Icon = icon === "batch" ? BatchIcon : SparkIcon;
  return (
    <div className="launcher-wrap">
      <button
        className={
          appearance === "text"
            ? "text-button"
            : `button button-${appearance} ${appearance === "primary" ? "button-large" : ""}`
        }
        disabled={busy}
        onClick={launch}
        type="button"
      >
        <Icon size={appearance === "text" ? 17 : 19} />
        {busy ? "Starting…" : label}
        {appearance === "text" ? <ArrowIcon size={16} /> : null}
      </button>
      {error ? (
        <span className="launcher-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
