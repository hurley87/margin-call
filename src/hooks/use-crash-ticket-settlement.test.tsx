// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getEvmWalletAddress: vi.fn(
    () => "0x0000000000000000000000000000000000000003"
  ),
  getMarginCallCrashConfig: vi.fn(() => ({
    address: "0x0000000000000000000000000000000000000001",
    deploymentBlock: 1n,
  })),
  readContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  readPlayerRecentTicket: vi.fn(),
  fetchCrashAttestation: vi.fn(),
  notifyWalletBalancesChanged: vi.fn(),
  subscribeToWalletBalanceChanges: vi.fn(() => () => undefined),
  transaction: {
    submit: vi.fn(),
    getSubmittedHash: vi.fn(),
    getSubmissionError: vi.fn(),
  },
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: { id: "did:privy:test" } }),
}));

vi.mock("@/lib/privy/wallet", () => ({
  getEvmWalletAddress: () => sdk.getEvmWalletAddress(),
}));

vi.mock("@/lib/margin-call-crash", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/margin-call-crash")
  >("@/lib/margin-call-crash");
  return {
    ...actual,
    getMarginCallCrashConfig: () => sdk.getMarginCallCrashConfig(),
    readPlayerRecentTicket: (...args: unknown[]) =>
      sdk.readPlayerRecentTicket(...args),
  };
});

vi.mock("@/lib/base-sepolia", () => ({
  baseSepoliaPublicClient: {
    readContract: (...args: unknown[]) => sdk.readContract(...args),
    waitForTransactionReceipt: (...args: unknown[]) =>
      sdk.waitForTransactionReceipt(...args),
  },
  BASE_SEPOLIA_CHAIN_ID: 84532,
}));

vi.mock("@/lib/inco-attestation", () => ({
  requestCrashAttestation: (...args: unknown[]) =>
    sdk.fetchCrashAttestation(...args),
}));

vi.mock("@/lib/wallet-balance-sync", () => ({
  notifyWalletBalancesChanged: () => sdk.notifyWalletBalancesChanged(),
  subscribeToWalletBalanceChanges: (
    ...args: Parameters<typeof sdk.subscribeToWalletBalanceChanges>
  ) => sdk.subscribeToWalletBalanceChanges(...args),
}));

vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => sdk.transaction,
}));

import { useCrashTicketSettlement } from "./use-crash-ticket-settlement";

const ticket = {
  id: 7n,
  player: "0x0000000000000000000000000000000000000003" as const,
  roundId: 12n,
  margin: 5_000_000n,
  leverageBps: 20_000n,
  reservedPayout: 10_000_000n,
  settled: false,
  claimed: false,
};

const finalizedRound = {
  id: 12n,
  openAt: 1_000n,
  lockAt: 1_045n,
  expiresAt: 1_945n,
  crashRandom:
    "0x000000000000000000000000000000000000000000000000000000000000cafe" as const,
  crashPointBps: 34_200n,
  totalMargin: 5_000_000n,
  reservedPayout: 10_000_000n,
  status: 3 as const,
};

describe("useCrashTicketSettlement", () => {
  beforeEach(() => {
    sdk.readContract.mockReset();
    sdk.waitForTransactionReceipt.mockReset();
    sdk.readPlayerRecentTicket.mockReset();
    sdk.fetchCrashAttestation.mockReset();
    sdk.notifyWalletBalancesChanged.mockReset();
    sdk.transaction.submit.mockReset();
    sdk.transaction.getSubmittedHash.mockReset();
    sdk.readContract.mockResolvedValue(12n);
    sdk.readPlayerRecentTicket.mockResolvedValue({
      ticket,
      round: finalizedRound,
    });
    sdk.transaction.submit.mockResolvedValue(true);
    sdk.transaction.getSubmittedHash.mockReturnValue("0xabc");
    sdk.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("loads a returning player's ticket and claims a win", async () => {
    const { result } = renderHook(() => useCrashTicketSettlement());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.outcome).toBe("won");
    expect(result.current.canClaim).toBe(true);

    await act(async () => {
      await result.current.claim();
    });

    expect(sdk.transaction.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0x0000000000000000000000000000000000000001",
        chainId: 84532,
      })
    );
    expect(sdk.notifyWalletBalancesChanged).toHaveBeenCalled();
  });

  it("settles a loss without transferring when the ticket lost", async () => {
    sdk.readPlayerRecentTicket.mockResolvedValue({
      ticket,
      round: { ...finalizedRound, crashPointBps: 9_900n },
    });
    const { result } = renderHook(() => useCrashTicketSettlement());
    await waitFor(() => expect(result.current.canSettle).toBe(true));

    await act(async () => {
      await result.current.settleLoss();
    });
    expect(sdk.transaction.submit).toHaveBeenCalled();
  });

  it("keeps confirmed status observable and records the claim transaction", async () => {
    // Initial load recovers the unsettled ticket; the post-flow refresh sees
    // it settled onchain.
    sdk.readPlayerRecentTicket
      .mockResolvedValueOnce({ ticket, round: finalizedRound })
      .mockResolvedValue({
        ticket: { ...ticket, settled: true, claimed: true },
        round: finalizedRound,
      });
    const { result } = renderHook(() => useCrashTicketSettlement());
    await waitFor(() => expect(result.current.canClaim).toBe(true));

    await act(async () => {
      await result.current.claim();
    });

    // Regression: refresh() after the flow used to batch a loading overwrite
    // into the same render, so "confirmed" was never observable.
    expect(result.current.status).toBe("confirmed");
    expect(result.current.transactions).toEqual([
      {
        stage: "claim",
        hash: "0xabc",
        url: expect.stringContaining("/tx/0xabc"),
        confirmed: true,
      },
    ]);
  });

  it("records each verify stage hash and reports the crash point early", async () => {
    // Round still Open onchain: the full reveal → attest → finalize path runs.
    const openRound = {
      ...finalizedRound,
      status: 1 as const,
      crashPointBps: 0n,
    };
    sdk.readPlayerRecentTicket
      .mockResolvedValueOnce({
        ticket,
        round: openRound,
      })
      .mockResolvedValue({
        ticket: { ...ticket, settled: true, claimed: true },
        round: { ...finalizedRound, crashPointBps: 20_000n },
      });
    // Keep getRound non-finalized so ensureRoundFinalized still submits finalize
    // (the flow adopts an onchain finalized round when the keeper wins the race).
    sdk.readContract.mockImplementation(
      async (params: { functionName?: string }) => {
        if (params.functionName === "getRound") {
          return { ...openRound, status: 2 as const };
        }
        return 12n;
      }
    );
    // 99_000_000 / (10_000 - 5_050) = 20_000 bps — the ticket's tier, a win.
    sdk.fetchCrashAttestation.mockResolvedValue({
      plaintext: 5_050n,
      signatures: ["0x01"],
    });
    sdk.transaction.getSubmittedHash
      .mockReturnValueOnce("0xaaa1")
      .mockReturnValueOnce("0xaaa2")
      .mockReturnValueOnce("0xaaa3");

    const onCrashPointKnown = vi.fn();
    const { result } = renderHook(() =>
      useCrashTicketSettlement({ onCrashPointKnown })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.verifyAndSettle();
    });

    expect(onCrashPointKnown).toHaveBeenCalledWith(20_000n);
    expect(result.current.transactions).toEqual([
      {
        stage: "reveal",
        hash: "0xaaa1",
        url: expect.stringContaining("/tx/0xaaa1"),
        confirmed: true,
      },
      {
        stage: "finalize",
        hash: "0xaaa2",
        url: expect.stringContaining("/tx/0xaaa2"),
        confirmed: true,
      },
      {
        stage: "claim",
        hash: "0xaaa3",
        url: expect.stringContaining("/tx/0xaaa3"),
        confirmed: true,
      },
    ]);
    expect(result.current.status).toBe("confirmed");
  });
});
