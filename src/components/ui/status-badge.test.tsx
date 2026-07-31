// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusBadge, statusLabel, statusTone } from "./status-badge";

describe("StatusBadge", () => {
  afterEach(cleanup);
  it.each([
    ["precheck_passed", "Pre-check passed", "success"],
    ["review_required", "Human review", "warning"],
    ["correction_needed", "Correction needed", "danger"],
    ["extracting", "Reading label", "info"],
  ])("renders %s as a clear user outcome", (status, label, tone) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(`status-${tone}`);
    expect(statusLabel(status)).toBe(label);
    expect(statusTone(status)).toBe(tone);
  });

  it("humanizes a future status rather than showing snake case", () => {
    expect(statusLabel("waiting_for_agent")).toBe("waiting for agent");
  });
});
