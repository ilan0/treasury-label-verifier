import { chromium } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const runs = Number.parseInt(process.env.BENCHMARK_RUNS ?? "10", 10);
const variantMode = process.env.BENCHMARK_VARIANTS ?? "unique";
const variantOffset = Number.parseInt(
  process.env.BENCHMARK_VARIANT_OFFSET ?? "0",
  10,
);
const warmupRuns = Number.parseInt(
  process.env.BENCHMARK_WARMUP_RUNS ?? "1",
  10,
);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
  throw new Error("BENCHMARK_RUNS must be an integer from 1 to 20.");
}
if (!Number.isInteger(warmupRuns) || warmupRuns < 0 || warmupRuns > 3) {
  throw new Error("BENCHMARK_WARMUP_RUNS must be an integer from 0 to 3.");
}
if (
  variantMode === "unique" &&
  (!Number.isInteger(variantOffset) ||
    variantOffset < 0 ||
    variantOffset + warmupRuns + runs > 20)
) {
  throw new Error(
    "Unique warmup and measured variants must remain within 1..20.",
  );
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(baseURL);
const measurements = [];

try {
  for (let iteration = 1; iteration <= warmupRuns + runs; iteration += 1) {
    const isWarmup = iteration <= warmupRuns;
    const run = iteration - warmupRuns;
    const performanceVariant =
      variantMode === "unique" ? variantOffset + iteration : 1;
    const startedAt = performance.now();
    const submission = await page.evaluate(
      async ({ performanceVariant }) => {
        const response = await fetch("/api/demo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            scenarioId: "compliant-bourbon",
            performanceVariant,
          }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.message ?? `Submission failed: ${response.status}`,
          );
        return payload.data;
      },
      { performanceVariant },
    );
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
      performanceVariant,
      acknowledgementMs: Math.round(acknowledgedAt - startedAt),
      completionMs: Math.round(completedAt - startedAt),
      status,
    };
    if (isWarmup) {
      process.stdout.write(
        `${JSON.stringify({ ...measurement, warmup: true })}\n`,
      );
    } else {
      measurements.push(measurement);
      process.stdout.write(`${JSON.stringify(measurement)}\n`);
    }
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
    warmupRuns,
    variantMode,
    variantOffset,
    acknowledgementMedianMs: percentile(acknowledgements, 0.5),
    acknowledgementP95Ms: percentile(acknowledgements, 0.95),
    completionMedianMs: percentile(completions, 0.5),
    completionP95Ms: percentile(completions, 0.95),
  })}\n`,
);
