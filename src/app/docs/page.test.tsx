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
      screen.getAllByText(/Margin Call pauses new leveraged positions/).length
    ).toBeGreaterThan(0);
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
  it("links the docs shortcut to an accessible agent section", () => {
    render(<DocsPage />);
    expect(
      screen
        .getByRole("link", { name: /Building an agent/ })
        .getAttribute("href")
    ).toBe("#agents");
    expect(screen.getByRole("heading", { name: "Agents & builders" }).id).toBe(
      "agents"
    );
    expect(screen.getByText("Dynamic is not required.")).not.toBeNull();
    expect(screen.getByText(/Already have a Bankr-style agent/)).not.toBeNull();
  });

  it("provides hosted tools and an unsigned preparation quickstart", () => {
    render(<DocsPage />);
    const config = screen.getByLabelText("MCP connection configuration");
    expect(
      JSON.parse(config.textContent ?? "").mcpServers["margin-call"].url
    ).toBe("https://margincall.fun/api/mcp");
    const prepare = screen.getByLabelText(
      "Prepare an unsigned 1.25x NVDAc position"
    );
    expect(prepare.textContent).toContain(
      "https://margincall.fun/api/agent/prepare-open"
    );
    expect(prepare.textContent).toContain("12500");
    for (const tool of [
      "get_assets",
      "get_market_state",
      "get_credit_pool",
      "quote_open",
      "get_position",
      "prepare_open",
    ]) {
      expect(screen.getAllByText(tool).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByText(/The public service never signs or broadcasts/)
    ).not.toBeNull();
    expect(
      screen.getByText(/waiting for each successful receipt/)
    ).not.toBeNull();
    expect(
      screen.getByText(/acquisition runs before the open’s pricing gate/)
    ).not.toBeNull();
  });
});
