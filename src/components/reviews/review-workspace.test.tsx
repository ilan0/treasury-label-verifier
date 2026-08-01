// @vitest-environment jsdom

import {
  act,
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
    vi.useRealTimers();
    vi.restoreAllMocks();
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
                latencyMs: 215,
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
                source: "cached_demo",
                strategy: "benchmark_replay",
                model: "validated-demo-fixture",
                latencyMs: 0,
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
    const provenance = screen.getByRole("complementary", {
      name: "Extraction provenance",
    });
    expect(within(provenance).getByText("Cached")).toBeVisible();
    expect(
      within(provenance).getByText("Validated demo extraction"),
    ).toBeVisible();
    expect(
      within(provenance).getByText("Benchmark fixture replay"),
    ).toBeVisible();
    expect(within(provenance).getByText("< 1 ms")).toBeVisible();
    expect(within(provenance).getByText("215 ms")).toBeVisible();
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

  it("polls aggressively while a result is fresh, then slows and pauses while hidden", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const callTimes: number[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        callTimes.push(performance.now());
        if (init?.signal) signals.push(init.signal);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                job: { id: "job-poll", status: "extracting" },
                application: {
                  externalId: "APP-POLL",
                  fields: { brandName: "POLLING LABEL" },
                },
                artifacts: [],
                findings: [],
                history: [],
                decisions: [],
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }),
    );

    const view = render(<ReviewWorkspace jobId="job-poll" />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(6_000));
    const callsAfterFastWindow = callTimes.length;
    expect(callsAfterFastWindow).toBeGreaterThanOrEqual(30);

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(callTimes.length - callsAfterFastWindow).toBe(2);

    visibility.mockReturnValue("hidden");
    const callsBeforeHiddenWindow = callTimes.length;
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(callTimes).toHaveLength(callsBeforeHiddenWindow);

    visibility.mockReturnValue("visible");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(callTimes).toHaveLength(callsBeforeHiddenWindow + 1);

    view.unmount();
    expect(signals.at(-1)?.aborted).toBe(true);
  });
});
