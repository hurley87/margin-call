// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DocsPage from "@/app/docs/page";

describe("DocsPage", () => {
  afterEach(cleanup);

  it("documents when leveraged positions can be opened", () => {
    render(<DocsPage />);

    expect(
      screen.getByRole("heading", { name: "Market pricing availability" })
    ).not.toBeNull();
    expect(
      screen.getByText(/New leveraged positions can only be opened/)
    ).not.toBeNull();
    expect(
      screen.getByText(/Margin Call pauses new leveraged positions/)
    ).not.toBeNull();
  });

  it("answers why a leveraged position cannot be opened right now", () => {
    render(<DocsPage />);

    expect(
      screen.getByText("Why can’t I open a leveraged position right now?")
    ).not.toBeNull();
    expect(
      screen.getByText(/requires fresh U\.S\. market pricing before creating/)
    ).not.toBeNull();
  });

  it("keeps pricing hours typical rather than guaranteed", () => {
    const { container } = render(<DocsPage />);
    const shown = container.textContent ?? "";

    expect(shown).toMatch(/typically during regular U\.S\. trading hours/);
    expect(shown).not.toMatch(/9:30|4:00/);
  });
});
