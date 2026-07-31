// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewWorkspace } from "./review-workspace";

describe("ReviewWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows canonical application facts and hides non-applicable rule clutter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              job: {
                id: "job-1",
                status: "completed",
                outcome: "precheck_passed",
                confidence: 0.97,
              },
              application: {
                externalId: "APP-001",
                regulatoryProfile: "faa_distilled_spirits",
                fields: {
                  brandName: "OLD TOM DISTILLERY",
                  classType: "Kentucky Straight Bourbon Whiskey",
                  alcoholByVolume: 45,
                  netContents: { value: 750, unit: "mL" },
                  responsibleParty: {
                    name: "Old Tom Distilling Company",
                    address: "Bardstown, Kentucky",
                  },
                },
              },
              artifacts: [
                {
                  id: "art-1",
                  signedUrl: "/demo/old-tom-bourbon.svg",
                  panelType: "front",
                },
              ],
              extraction: {
                fields: {
                  brandName: "OLD TOM DISTILLERY",
                  classType: "Kentucky Straight Bourbon Whiskey",
                  abv: 45,
                  netContents: { value: 750, unit: "mL" },
                  producerName: "Old Tom Distilling Company",
                  producerAddress: "Bardstown, Kentucky",
                },
              },
              findings: [
                {
                  id: "result-1",
                  ruleId: "spirits.brand-name",
                  title: "Brand name",
                  status: "pass",
                },
                {
                  id: "result-2",
                  ruleId: "spirits.aspartame",
                  title: "Aspartame disclosure",
                  status: "not_applicable",
                },
              ],
              history: [],
              decisions: [],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<ReviewWorkspace jobId="job-1" />);
    expect(
      await screen.findByRole("heading", { name: "OLD TOM DISTILLERY" }),
    ).toBeVisible();
    expect(screen.getByText("All assessed checks passed")).toBeVisible();
    expect(screen.queryByText("Aspartame disclosure")).not.toBeInTheDocument();
    const comparison = screen.getByRole("table", { name: "Field comparison" });
    expect(within(comparison).getAllByText("45%")).toHaveLength(2);
    expect(
      within(comparison).getAllByText("Old Tom Distilling Company"),
    ).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show passed checks" }),
    );
    expect(screen.getAllByText("Brand name")).toHaveLength(2);
    expect(screen.getByText("Aspartame disclosure")).toBeVisible();
  });
});
