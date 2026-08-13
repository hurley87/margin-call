// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeskDollarsFaucetChrome } from "@/hooks/use-desk-dollars-faucet";

const sdk = vi.hoisted(() => {
  const readyFaucet = () => ({
    balance: 123450000n as bigint | null,
    decimals: 6 as number | null,
    status: "ready" as
      "loading" | "ready" | "pending" | "confirmed" | "error" | "unavailable",
    error: null as string | null,
    eligible: true,
    cooldownSeconds: 0n,
    canClaim: true,
    canRetry: false,
    claim: vi.fn(),
    retry: vi.fn(),
  });
  return {
    user: {
      wallet: {
        address: "0x0000000000000000000000000000000000000003",
        chainType: "ethereum",
        walletClientType: "privy",
      },
      linkedAccounts: [],
    },
    readyFaucet,
    faucet: readyFaucet(),
  };
});

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: sdk.user }),
}));
vi.mock("@/hooks/use-desk-dollars-faucet", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/use-desk-dollars-faucet")
  >("@/hooks/use-desk-dollars-faucet");
  return {
    ...actual,
    useDeskDollarsFaucet: () => sdk.faucet,
  };
});

import { DeskDollarsPanel } from "./desk-dollars-panel";

beforeEach(() => {
  sdk.faucet = sdk.readyFaucet();
});
afterEach(() => cleanup());

describe("getDeskDollarsFaucetChrome", () => {
  it("hides claim while balance is unknown", () => {
    expect(
      getDeskDollarsFaucetChrome({
        balance: null,
        status: "loading",
        canRetry: false,
      })
    ).toEqual({ showOffer: false, showClaimButton: false });
  });

  it("offers claim only for a known empty balance", () => {
    expect(
      getDeskDollarsFaucetChrome({
        balance: 0n,
        status: "ready",
        canRetry: false,
      })
    ).toEqual({ showOffer: true, showClaimButton: true });
  });

  it("hides claim when funded unless a claim is in flight", () => {
    expect(
      getDeskDollarsFaucetChrome({
        balance: 83_000_000n,
        status: "ready",
        canRetry: false,
      })
    ).toEqual({ showOffer: false, showClaimButton: false });
    expect(
      getDeskDollarsFaucetChrome({
        balance: 83_000_000n,
        status: "pending",
        canRetry: false,
      })
    ).toEqual({ showOffer: false, showClaimButton: true });
  });
});

describe("DeskDollarsPanel", () => {
  it("hides claim when the wallet already has a balance and uses USDC copy", () => {
    render(<DeskDollarsPanel />);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "Balance: 123.45 USDC"
      )
    ).not.toBeNull();
    expect(screen.getByText(/Base Sepolia only/)).not.toBeNull();
    expect(screen.getByText(/no real value/)).not.toBeNull();
    expect(screen.getByText("Desk Dollars (USDC)")).not.toBeNull();
    expect(
      screen.queryByText("Eligible to claim 100 USDC from the faucet.")
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim 100 USDC" })).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("shows claim when the wallet balance is zero", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: 0n,
      eligible: true,
      canClaim: true,
    };
    render(<DeskDollarsPanel />);
    expect(
      screen.getByText("Eligible to claim 100 USDC from the faucet.")
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Claim 100 USDC" })
    ).not.toBeNull();
  });

  it("does not flash claim while the balance is still loading", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: null,
      status: "loading",
      canClaim: false,
      eligible: false,
    };
    render(<DeskDollarsPanel />);
    expect(screen.getByText(/Loading Desk Dollars balance/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("keeps pending claim chrome visible even when already funded", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: 83_000_000n,
      status: "pending",
      eligible: false,
      canClaim: false,
    };
    render(<DeskDollarsPanel />);
    expect(
      screen.getByText(/pending until its Base Sepolia receipt succeeds/)
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Claim pending…" })
    ).not.toBeNull();
  });

  it("reports cooldown honestly when unfunded", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: 0n,
      status: "ready",
      cooldownSeconds: 3600n,
      eligible: false,
      canClaim: false,
    };
    render(<DeskDollarsPanel />);
    expect(
      screen.getByText("Next 100 USDC faucet claim in 60 minutes.")
    ).not.toBeNull();
  });
});
