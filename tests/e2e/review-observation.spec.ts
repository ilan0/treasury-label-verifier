import { expect, test } from "@playwright/test";

test("fresh review status is observed quickly and exposes safe extraction provenance", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One deterministic observation-loop browser check",
  );
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  let requestCount = 0;
  await page.route("**/api/jobs/observation-test", async (route) => {
    requestCount += 1;
    const completed = requestCount >= 4;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          job: {
            id: "observation-test",
            status: completed ? "completed" : "extracting",
            outcome: completed ? "precheck_passed" : undefined,
            confidence: completed ? 0.96 : undefined,
            latencyMs: completed ? 917 : undefined,
          },
          application: {
            externalId: "OBS-001",
            regulatoryProfile: "faa_distilled_spirits",
            fields: {
              brandName: "ADAPTIVE OBSERVATION",
              classType: "Bourbon Whiskey",
              alcoholByVolume: 45,
            },
          },
          artifacts: [],
          extraction: completed
            ? {
                source: "openai",
                strategy: "openai_vision",
                model: "gpt-5.6-luna",
                latencyMs: 842,
                fields: {
                  brandName: "ADAPTIVE OBSERVATION",
                  classType: "Bourbon Whiskey",
                  abv: 45,
                },
              }
            : null,
          findings: completed
            ? [
                {
                  id: "brand-result",
                  ruleId: "spirits.brand-name",
                  title: "Brand name",
                  status: "pass",
                },
              ]
            : [],
          history: [],
          decisions: [],
        },
      }),
    });
  });

  const startedAt = Date.now();
  await page.goto("/reviews/observation-test");
  await expect(
    page.getByRole("heading", { name: "ADAPTIVE OBSERVATION" }),
  ).toBeVisible({ timeout: 3_000 });
  expect(Date.now() - startedAt).toBeLessThan(2_500);
  expect(requestCount).toBeGreaterThanOrEqual(4);

  const provenance = page.getByRole("complementary", {
    name: "Extraction provenance",
  });
  await expect(provenance.getByText("Live", { exact: true })).toBeVisible();
  await expect(
    provenance.getByText("Live OpenAI vision extraction"),
  ).toBeVisible();
  await expect(provenance.getByText("Vision field extraction")).toBeVisible();
  await expect(provenance.getByText("gpt-5.6-luna")).toBeVisible();
  await expect(provenance.getByText("842 ms")).toBeVisible();
  await expect(provenance.getByText("917 ms")).toBeVisible();
  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});
