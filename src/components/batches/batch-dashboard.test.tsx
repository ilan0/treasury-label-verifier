// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BatchDashboard } from "./batch-dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("BatchDashboard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("paginates a large batch instead of rendering hundreds of rows", async () => {
    const jobs = Array.from({ length: 30 }, (_, index) => ({
      id: `job-${index + 1}`,
      externalId: `APP-${String(index + 1).padStart(3, "0")}`,
      brandName: `Sample brand ${index + 1}`,
      classType: "Red Wine",
      profile: "faa_wine",
      status: "completed",
      outcome: "precheck_passed",
      confidence: 0.95,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              batch: {
                id: "batch-1",
                name: "30-item batch",
                totalCount: 30,
                status: "completed",
              },
              jobs,
              aggregates: { total: 30, completed: 30, precheckPassed: 30 },
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<BatchDashboard batchId="batch-1" />);
    expect(await screen.findByText("APP-001")).toBeVisible();
    const title = screen.getByRole("heading", {
      name: "30-item batch",
    }).parentElement;
    expect(title).not.toBeNull();
    expect(within(title!).getByText("Batch complete")).toBeVisible();
    expect(
      within(title!).queryByText("Pre-check passed"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(26);
    expect(screen.queryByText("APP-026")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("APP-026")).toBeVisible();
    expect(screen.getByText("26–30 of 30")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "50" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(31);
    expect(screen.getByText("APP-001")).toBeVisible();
  });
});
