// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const readyFaucet = () => ({
    balance: 123450000n,
    decimals: 6,
    status: "ready",
    error: null,
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
vi.mock("@/hooks/use-desk-dollars-faucet", () => ({
  useDeskDollarsFaucet: () => sdk.faucet,
}));

import { DeskDollarsPanel } from "./desk-dollars-panel";

beforeEach(() => {
  sdk.faucet = sdk.readyFaucet();
});
afterEach(() => cleanup());

describe("DeskDollarsPanel", () => {
  it("uses required testnet/value copy and never presents the balance as USD", () => {
    render(<DeskDollarsPanel />);
    expect(screen.getByText("Balance: 123.45 tUSD")).not.toBeNull();
    expect(screen.getByText(/Base Sepolia only/)).not.toBeNull();
    expect(screen.getByText(/no real value/)).not.toBeNull();
    expect(
      screen.getByText("Eligible to claim 100 tUSD from the faucet.")
    ).not.toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("reports cooldown and pending receipt semantics honestly", () => {
    sdk.faucet = {
      ...sdk.faucet,
      status: "pending",
      eligible: false,
      cooldownSeconds: 3600n,
      canClaim: false,
    };
    const { rerender } = render(<DeskDollarsPanel />);
    expect(
      screen.getByText(/pending until its Base Sepolia receipt succeeds/)
    ).not.toBeNull();
    sdk.faucet = { ...sdk.faucet, status: "ready", cooldownSeconds: 3600n };
    rerender(<DeskDollarsPanel />);
    expect(
      screen.getByText("Next 100 tUSD faucet claim in 60 minutes.")
    ).not.toBeNull();
  });
});
