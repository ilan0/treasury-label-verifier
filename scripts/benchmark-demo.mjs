import { chromium } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const runs = Number.parseInt(process.env.BENCHMARK_RUNS ?? "10", 10);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
  throw new Error("BENCHMARK_RUNS must be an integer from 1 to 20.");
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(baseURL);
const measurements = [];

try {
  for (let run = 1; run <= runs; run += 1) {
    const startedAt = performance.now();
    const submission = await page.evaluate(async () => {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ scenarioId: "compliant-bourbon" }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.message ?? `Submission failed: ${response.status}`,
        );
      return payload.data;
    });
    const acknowledgedAt = performance.now();
    let status = "queued";
    while (
      ![
        "completed",
        "review_required",
        "correction_needed",
        "rejected",
        "failed",
        "cancelled",
        "expired",
      ].includes(status)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      status = await page.evaluate(async (jobId) => {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.message ?? `Polling failed: ${response.status}`,
          );
        return payload.data.job.status;
      }, submission.jobId);
    }
    const completedAt = performance.now();
    const measurement = {
      run,
      acknowledgementMs: Math.round(acknowledgedAt - startedAt),
      completionMs: Math.round(completedAt - startedAt),
      status,
    };
    measurements.push(measurement);
    process.stdout.write(`${JSON.stringify(measurement)}\n`);
  }
} finally {
  await browser.close();
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};
const acknowledgements = measurements.map((item) => item.acknowledgementMs);
const completions = measurements.map((item) => item.completionMs);
process.stdout.write(
  `${JSON.stringify({
    runs,
    acknowledgementMedianMs: percentile(acknowledgements, 0.5),
    acknowledgementP95Ms: percentile(acknowledgements, 0.95),
    completionMedianMs: percentile(completions, 0.5),
    completionP95Ms: percentile(completions, 0.95),
  })}\n`,
);
