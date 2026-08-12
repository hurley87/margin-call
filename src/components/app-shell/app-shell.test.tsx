// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  pathname: "/",
  privy: {
    ready: true,
    authenticated: false,
    user: null as unknown,
  },
  wallets: {
    ready: false,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sdk.pathname,
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogin: () => ({ login: vi.fn() }),
  usePrivy: () => ({ ...sdk.privy, logout: vi.fn() }),
  useWallets: () => sdk.wallets,
}));

vi.mock("@/hooks/use-desk-dollars-balance", () => ({
  useDeskDollarsBalance: () => ({
    balance: null,
    decimals: null,
  }),
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  beforeEach(() => {
    sdk.pathname = "/";
    sdk.privy = { ready: true, authenticated: false, user: null };
    sdk.wallets = { ready: false };
  });

  afterEach(cleanup);

  it("renders Floor and LP Desk navigation links", () => {
    render(
      <AppShell>
        <p>Floor content</p>
      </AppShell>
    );

    const nav = screen.getByTestId("app-shell-nav");
    expect(nav).toBeTruthy();
    const floor = screen.getByRole("link", { name: "Floor" });
    const lp = screen.getByRole("link", { name: "LP Desk" });
    expect(floor.getAttribute("href")).toBe("/");
    expect(lp.getAttribute("href")).toBe("/lp");
    expect(floor.getAttribute("aria-current")).toBe("page");
    expect(lp.getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("no-real-value-disclosure")).toBeTruthy();
    expect(screen.getByText("Floor content")).toBeTruthy();
  });

  it("marks LP Desk as current on /lp", () => {
    sdk.pathname = "/lp";
    render(
      <AppShell>
        <p>LP content</p>
      </AppShell>
    );

    expect(
      screen.getByRole("link", { name: "LP Desk" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Floor" }).getAttribute("aria-current")
    ).toBeNull();
  });
});
