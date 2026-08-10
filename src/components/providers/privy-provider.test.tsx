// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="privy-provider">{children}</div>
  ),
  usePrivy: () => ({
    ready: true,
    authenticated: false,
    getAccessToken: async () => null,
  }),
}));

vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="convex-provider">{children}</div>
  ),
  ConvexReactClient: vi.fn(),
}));

import { MarginCallPrivyProvider } from "@/components/providers/privy-provider";

describe("MarginCallPrivyProvider", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("renders a configuration notice instead of throwing when env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");

    render(
      <MarginCallPrivyProvider>
        <p>App</p>
      </MarginCallPrivyProvider>
    );

    expect(screen.queryByText("App")).toBeNull();
    expect(document.body.textContent).toContain(
      "Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_CONVEX_URL to enable sign-in."
    );
  });

  it("wraps children in the Privy and Convex providers when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "cm_test_app_id");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");

    render(
      <MarginCallPrivyProvider>
        <p>App</p>
      </MarginCallPrivyProvider>
    );

    expect(screen.getByText("App")).not.toBeNull();
    expect(screen.getByTestId("privy-provider")).not.toBeNull();
    expect(screen.getByTestId("convex-provider")).not.toBeNull();
  });
});
