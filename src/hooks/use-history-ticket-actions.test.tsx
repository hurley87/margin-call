// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

const sdk = vi.hoisted(() => ({
  getMarginCallCrashConfig: vi.fn(() => ({
    address: "0x0000000000000000000000000000000000000001" as Address,
    deploymentBlock: 1n,
  })),
  waitForTransactionReceipt: vi.fn(),
  fetchCrashAttestation: vi.fn(),
  notifyWalletBalancesChanged: vi.fn(),
  transaction: {
    submit: vi.fn(),
    getSubmittedHash: vi.fn(),
    getSubmissionError: vi.fn(),
  },
}));

vi.mock("@/lib/margin-call-crash", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/margin-call-crash")
  >("@/lib/margin-call-crash");
  return {
    ...actual,
    getMarginCallCrashConfig: () => sdk.getMarginCallCrashConfig(),
  };
});

vi.mock("@/lib/base-sepolia", () => ({
  baseSepoliaPublicClient: {
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
}));

vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => sdk.transaction,
}));

import { useHistoryTicketActions } from "./use-history-ticket-actions";

const PLAYER = "0x0000000000000000000000000000000000000003" as Address;

const ticket = {
  id: 7n,
  player: PLAYER,
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
    "0x000000000000000000000000000000000000000000000000000000000000cafe" as Hex,
  crashPointBps: 34_200n,
  totalMargin: 5_000_000n,
  reservedPayout: 10_000_000n,
  status: 3 as const,
};

const expiredRound = {
  ...finalizedRound,
  crashPointBps: 0n,
  status: 4 as const,
};

describe("useHistoryTicketActions", () => {
  beforeEach(() => {
    sdk.waitForTransactionReceipt.mockReset();
    sdk.fetchCrashAttestation.mockReset();
    sdk.notifyWalletBalancesChanged.mockReset();
    sdk.transaction.submit.mockReset();
    sdk.transaction.getSubmittedHash.mockReset();
    sdk.transaction.getSubmissionError.mockReset();
    sdk.transaction.submit.mockResolvedValue(true);
    sdk.transaction.getSubmittedHash.mockReturnValue("0xabc" as Hex);
    sdk.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("claims through a receipt-backed sponsored stage", async () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useHistoryTicketActions(onSettled));

    await act(async () => {
      await result.current.claim(ticket);
    });

    expect(sdk.transaction.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0x0000000000000000000000000000000000000001",
        chainId: 84532,
      })
    );
    expect(result.current.status).toBe("confirmed");
    expect(sdk.notifyWalletBalancesChanged).toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalled();
  });

  it("refunds an expired ticket and exposes retry after confirmation-unknown", async () => {
    sdk.waitForTransactionReceipt.mockRejectedValueOnce(
      new Error("receipt timeout")
    );
    const { result } = renderHook(() => useHistoryTicketActions());

    await act(async () => {
      await result.current.refund(ticket);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/couldn't confirm/);
    expect(result.current.activeTicketId).toBe(7n);

    sdk.waitForTransactionReceipt.mockResolvedValueOnce({ status: "success" });
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe("confirmed");
    // Retry re-checks the pending hash; it must not resubmit.
    expect(sdk.transaction.submit).toHaveBeenCalledTimes(1);
  });

  it("settles a loss and expires a round through sponsored stages", async () => {
    const { result } = renderHook(() => useHistoryTicketActions());

    await act(async () => {
      await result.current.settleLoss(ticket);
    });
    expect(result.current.status).toBe("confirmed");

    await act(async () => {
      await result.current.expireRound(ticket, expiredRound);
    });
    expect(result.current.status).toBe("confirmed");
    expect(sdk.transaction.submit).toHaveBeenCalledTimes(2);
  });

  it("suppresses duplicate in-flight actions", async () => {
    let resolveSubmit: ((value: boolean) => void) | undefined;
    sdk.transaction.submit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { result } = renderHook(() => useHistoryTicketActions());

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.claim(ticket);
    });
    await waitFor(() => expect(result.current.status).toBe("claim-submitting"));

    let second = true;
    await act(async () => {
      second = await result.current.claim(ticket);
    });
    expect(second).toBe(false);
    expect(sdk.transaction.submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.(true);
      await first;
    });
    expect(result.current.status).toBe("confirmed");
  });
});
