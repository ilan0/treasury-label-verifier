import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/submit", "/methodology"]) {
  test(`${route} has no serious or critical axe findings @a11y`, async ({
    page,
  }) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).analyze();
    const blocking = result.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(
      blocking,
      blocking
        .map((item) => `${item.id}: ${item.help} (${item.nodes.length} nodes)`)
        .join("\n"),
    ).toEqual([]);
  });
}
