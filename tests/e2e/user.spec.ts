import { expect, test, type Page } from "@playwright/test";

function captureBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500)
      failures.push(`network: ${response.status()} ${response.url()}`);
  });
  return () => expect(failures, failures.join("\n")).toEqual([]);
}

test("an user can understand and navigate the product immediately", async ({
  page,
}) => {
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /review label applications with evidence/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run a complete example" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Verify your own label" }),
  ).toBeVisible();
  await expect(page.getByText("No account or files required")).toBeVisible();

  const desktopMethodology = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Methodology", exact: true });
  if (await desktopMethodology.isVisible()) await desktopMethodology.click();
  else await page.getByRole("link", { name: "How checks work" }).click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /ai reads the evidence/i }),
  ).toBeVisible();
  await expect(page.getByText("Ruleset 2026-07-31.1")).toBeVisible();
  assertNoFailures();
});

test("manual intake exposes accessible validation and preserves user input", async ({
  page,
}) => {
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/submit");
  const brand = page.getByLabel(/brand name/i);
  await brand.fill("My Test Brand");
  await page.getByRole("button", { name: /continue to artwork/i }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Check the highlighted fields")).toBeVisible();
  await expect(
    page.getByText(/enter the class or type designation/i),
  ).toBeVisible();
  await expect(brand).toHaveValue("My Test Brand");
  await expect(page).toHaveURL(/\/submit$/);

  await page.getByText("Conditional application facts").click();
  await expect(page.getByLabel(/responsible-party role phrase/i)).toBeVisible();
  await expect(page.getByLabel(/contains sulfites/i)).toBeVisible();
  assertNoFailures();
});

test("document and batch modes explain their required inputs", async ({
  page,
}) => {
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/submit?mode=document");
  await expect(
    page.getByRole("heading", { name: "Upload the application" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /extract application draft/i })
    .click();
  await expect(
    page.getByText(/choose an application document to continue/i),
  ).toBeVisible();

  await page.getByRole("button", { name: /process a batch/i }).click();
  await expect(
    page.getByRole("link", { name: /download csv/i }),
  ).toHaveAttribute("href", "/sample-batch.csv");
  assertNoFailures();
});

test("batch records are session-isolated and require confirmation before deletion", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One database-backed browser check",
  );
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/");
  const batchId = await page.evaluate(async () => {
    const response = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "single",
        name: "Browser authorization check",
        application: {
          regulatoryProfile: "faa_distilled_spirits",
          originType: "domestic",
          fields: {
            brandName: "BROWSER CHECK",
            classType: "Bourbon Whiskey",
            abv: "45",
            proof: "90",
            netContents: "750 mL",
            producerName: "Browser Check Distilling Co.",
            producerAddress: "Louisville, KY",
            responsibleRole: "Bottled by",
            countryOfOrigin: "",
            appellation: "",
            foreignWinePercentage: "",
            ageStatement: "",
            stateOfDistillation: "",
            compositionStatement: "",
            neutralSpiritsCommodity: "",
            neutralSpiritsPercentage: "",
            profile: "faa_distilled_spirits",
            imported: false,
            alcoholContentRequired: true,
            compositionStatementRequired: false,
            appellationRequired: false,
            foreignWinePercentageRequired: false,
            ageStatementRequired: false,
            stateOfDistillationRequired: false,
            containsSulfites: false,
            containsYellow5: false,
            containsCarmineOrCochineal: false,
            containsAspartame: false,
            containsNeutralSpirits: false,
            woodTreatmentOrColoringDisclosureRequired: false,
          },
        },
      }),
    });
    if (!response.ok)
      throw new Error(`Draft creation failed: ${response.status}`);
    const payload = (await response.json()) as { data: { batchId: string } };
    return payload.data.batchId;
  });

  await page.goto(`/batches/${batchId}`);
  await expect(page.getByText("Browser authorization check")).toBeVisible();
  await expect(page.getByText("1 applications")).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`${new URL(page.url()).origin}/batches/${batchId}`);
  await expect(secondPage.getByText("Batch unavailable")).toBeVisible();
  await expect(secondPage.getByText(/unavailable|expired/i)).toBeVisible();
  await secondContext.close();

  await page.getByRole("button", { name: "Batch actions" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Cancel queued applications?",
  );
  await page.getByRole("button", { name: "Delete instead" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Artwork and results will be removed and cannot be recovered.",
  );
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/$/);
  assertNoFailures();
});

test("a real queued example reaches an evidence-backed result", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.PROOFCHECK_LIVE_E2E !== "1" ||
      testInfo.project.name !== "desktop",
    "Release-only live queue check",
  );
  test.setTimeout(90_000);
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Run a complete example" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByText("Pre-check passed")).toBeVisible({
    timeout: 75_000,
  });
  await expect(
    page.getByRole("heading", { name: "Submitted vs. observed" }),
  ).toBeVisible();
  await expect(page.getByText("All assessed checks passed")).toBeVisible();
  assertNoFailures();
});

test("a human can document an override and see its immutable history after reload", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.PROOFCHECK_REVIEW_E2E !== "1" ||
      testInfo.project.name !== "desktop",
    "Release-only live human-review check",
  );
  test.setTimeout(120_000);
  const assertNoFailures = captureBrowserFailures(page);
  await page.goto("/");
  const lowQualityCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Low-quality photograph" }),
  });
  await lowQualityCard.getByRole("button", { name: "Run example" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText("Human review", { exact: true })).toBeVisible({
    timeout: 90_000,
  });

  await page.getByRole("radio", { name: /Accept with override/i }).check();
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision not recorded")).toBeVisible();
  await expect(page.getByText(/at least 10 characters/i)).toBeVisible();

  const rationale =
    "Reviewer accepts the visible evidence despite the documented glare.";
  await page.getByLabel(/Review notes/i).fill(rationale);
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();
  await page.getByText("Processing and decision history").click();
  await expect(
    page.getByText("Accepted with documented override"),
  ).toBeVisible();
  await expect(page.getByText(rationale)).toBeVisible();

  await page.reload();
  await page.getByText("Processing and decision history").click();
  await expect(
    page.getByText("Accepted with documented override"),
  ).toBeVisible();
  await expect(page.getByText(rationale)).toBeVisible();
  assertNoFailures();
});

test("a real application document and private artwork upload can be confirmed and processed", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.PROOFCHECK_LIVE_E2E !== "1" ||
      testInfo.project.name !== "desktop",
    "Release-only live provider and storage check",
  );
  test.setTimeout(150_000);
  const assertNoFailures = captureBrowserFailures(page);

  await page.goto("/submit?mode=document");
  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/old-tom-application.txt");
  await page
    .getByRole("button", { name: /extract application draft/i })
    .click();

  await expect(
    page.getByRole("heading", { name: "Confirm the extracted draft" }),
  ).toBeVisible({ timeout: 75_000 });
  await expect(page.getByLabel(/brand name/i)).toHaveValue(
    "OLD TOM DISTILLERY",
  );
  await expect(page.getByLabel(/class \/ type/i)).toHaveValue(
    "Kentucky Straight Bourbon Whiskey",
  );
  await page.getByRole("button", { name: /confirm and continue/i }).click();

  await expect(
    page.getByRole("heading", { name: "Add the complete label set" }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles("public/demo/old-tom-bourbon.png");
  await page.getByRole("button", { name: /start verification/i }).click();

  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 25_000 });
  await expect(page.getByText("Human review")).toBeVisible({ timeout: 75_000 });
  await expect(page.getByText("Warning minimum type size")).toBeVisible();
  const warningSizeFinding = page.locator("article.finding-card").filter({
    hasText: "Warning minimum type size",
  });
  await expect(
    warningSizeFinding.getByText("Not assessed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Label artwork" }),
  ).toBeVisible();
  assertNoFailures();
});

test("the required 250-item benchmark reports durable independent results", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.PROOFCHECK_BATCH_E2E !== "1" ||
      testInfo.project.name !== "desktop",
    "Release-only durable batch stress check",
  );
  test.setTimeout(420_000);
  const assertNoFailures = captureBrowserFailures(page);

  await page.goto("/");
  await page
    .getByRole("button", { name: "Run 250-item batch" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/batches\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText("250 applications")).toBeVisible();
  await expect(page.getByText("Batch complete")).toBeVisible({
    timeout: 360_000,
  });
  await expect(page.getByText("250 of 250")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  await page.getByLabel("Filter status").selectOption("review");
  await expect(page.getByText(/shown/)).toBeVisible();
  await page.getByLabel("Filter status").selectOption("all");
  await page.getByLabel("Search applications").fill("BENCH-250");
  await expect(page.getByText("BENCH-250", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export results" }).click();
  assertNoFailures();
});
