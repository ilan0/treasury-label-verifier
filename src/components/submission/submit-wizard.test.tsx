// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmitWizard } from "./submit-wizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("SubmitWizard", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);

  it("keeps an incomplete manual application on the details step", () => {
    render(<SubmitWizard initialMode="manual" />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue to artwork/i }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check the highlighted fields",
    );
    expect(
      screen.getByText("Enter the brand name from the application."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Application details" }),
    ).toBeVisible();
  });

  it("requires a manifest before entering the batch artwork step", () => {
    render(<SubmitWizard initialMode="batch" />);
    expect(screen.getByRole("link", { name: /download csv/i })).toHaveAttribute(
      "href",
      "/sample-batch.csv",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /continue to artwork/i }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose the completed CSV manifest",
    );
    expect(
      screen.getByRole("heading", { name: "Map a batch manifest" }),
    ).toBeVisible();
  });

  it("makes document extraction and explicit confirmation visible", () => {
    render(<SubmitWizard initialMode="document" />);
    expect(
      screen.getByRole("heading", { name: "Upload the application" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /extract application draft/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/remain editable and require confirmation/i),
    ).toBeVisible();
  });
});
