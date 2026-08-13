// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    readyFaucet,
    faucet: readyFaucet(),
  };
});

vi.mock("@/hooks/use-desk-dollars-faucet", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/use-desk-dollars-faucet")
  >("@/hooks/use-desk-dollars-faucet");
  return {
    ...actual,
    useDeskDollarsFaucet: () => sdk.faucet,
  };
});

import { DeskDollarsFaucet } from "./desk-dollars-faucet";

const WALLET = "0x0000000000000000000000000000000000000003" as const;

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

describe("DeskDollarsFaucet", () => {
  it("renders nothing when the wallet already has a balance", () => {
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
    expect(screen.queryByTestId("desk-dollars-faucet")).toBeNull();
    expect(screen.queryByText("Desk Dollars (USDC)")).toBeNull();
    expect(screen.queryByText(/Balance:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim 100 USDC" })).toBeNull();
  });

  it("shows claim when the wallet balance is zero", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: 0n,
      eligible: true,
      canClaim: true,
    };
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
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
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
    expect(screen.queryByTestId("desk-dollars-faucet")).toBeNull();
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
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
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
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
    expect(
      screen.getByText("Next 100 USDC faucet claim in 60 minutes.")
    ).not.toBeNull();
  });

  it("invokes claim from the faucet button", () => {
    sdk.faucet = {
      ...sdk.faucet,
      balance: 0n,
      eligible: true,
      canClaim: true,
    };
    render(<DeskDollarsFaucet walletAddress={WALLET} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim 100 USDC" }));
    expect(sdk.faucet.claim).toHaveBeenCalledOnce();
  });
});
