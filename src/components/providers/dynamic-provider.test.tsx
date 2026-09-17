// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dynamicProviderMock = vi.fn(
  ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dynamic-provider">{children}</div>
  )
);

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDynamicProvider(props: {
      children?: React.ReactNode;
      client?: unknown;
    }) {
      return dynamicProviderMock(props);
    },
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="query-client-provider">{children}</div>
  ),
}));

vi.mock("@/lib/dynamic/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dynamic/client")>(
    "@/lib/dynamic/client"
  );
  return {
    ...actual,
    getDynamicClient: vi.fn(() => ({ id: "mock-client" })),
    ensureDynamicClientInitialized: vi.fn(async () => ({ id: "mock-client" })),
  };
});

import { MarginCallDynamicProvider } from "@/components/providers/dynamic-provider";

describe("MarginCallDynamicProvider", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    dynamicProviderMock.mockClear();
  });

  it("renders children without Dynamic when the environment id is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "");

    render(
      <MarginCallDynamicProvider>
        <p>App</p>
      </MarginCallDynamicProvider>
    );

    expect(screen.getByText("App")).not.toBeNull();
    expect(screen.queryByTestId("dynamic-provider")).toBeNull();
    expect(screen.queryByTestId("query-client-provider")).toBeNull();
  });

  it("wraps children in QueryClient and Dynamic providers when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "env_test_123");

    render(
      <MarginCallDynamicProvider>
        <p>App</p>
      </MarginCallDynamicProvider>
    );

    expect(screen.getByText("App")).not.toBeNull();
    expect(screen.getByTestId("query-client-provider")).not.toBeNull();
    expect(screen.getByTestId("dynamic-provider")).not.toBeNull();
  });
});
