// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";

const sdk = vi.hoisted(() => ({
  transaction: {
    submit: vi.fn(async () => true),
    getSubmittedHash: vi.fn(
      () =>
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
    ),
    getSubmissionError: vi.fn(() => null),
  },
  wait: vi.fn(async () => ({ status: "success" as const })),
  requestCrashAttestation: vi.fn(async () => ({
    plaintext: 2_080n,
    signatures: ["0x01"] as Hex[],
  })),
  readCrashRoundForLp: vi.fn(),
  notifyWalletBalancesChanged: vi.fn(),
}));

vi.mock("@/lib/base-sepolia", () => ({
  BASE_SEPOLIA_CHAIN_ID: 84532,
  baseSepoliaPublicClient: {
    waitForTransactionReceipt: sdk.wait,
  },
}));

vi.mock("@/lib/inco-attestation", () => ({
  requestCrashAttestation: sdk.requestCrashAttestation,
}));

vi.mock("@/lib/bankroll-vault", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bankroll-vault")>(
    "@/lib/bankroll-vault"
  );
  return {
    ...actual,
    readCrashRoundForLp: sdk.readCrashRoundForLp,
  };
});

vi.mock("@/lib/margin-call-crash", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/margin-call-crash")
  >("@/lib/margin-call-crash");
  return {
    ...actual,
    getMarginCallCrashConfig: () => ({
      address: "0x00000000000000000000000000000000000000c8",
      deploymentBlock: 1n,
    }),
  };
});

vi.mock("@/lib/wallet-balance-sync", () => ({
  notifyWalletBalancesChanged: () => sdk.notifyWalletBalancesChanged(),
}));

vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => sdk.transaction,
}));

import { useLpFreezeActions } from "./use-lp-freeze-actions";

describe("useLpFreezeActions", () => {
  beforeEach(() => {
    sdk.transaction.submit.mockClear().mockResolvedValue(true);
    sdk.wait.mockClear().mockResolvedValue({ status: "success" });
    sdk.requestCrashAttestation.mockClear();
    sdk.readCrashRoundForLp.mockReset();
    sdk.notifyWalletBalancesChanged.mockClear();
  });

  it("finalizes a reveal-frozen blocker after attestation", async () => {
    sdk.readCrashRoundForLp.mockResolvedValue({
      id: 7n,
      status: 2,
      crashRandom:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      openAt: 1n,
      lockAt: 2n,
      expiresAt: 3n,
      crashPointBps: 0n,
      totalMargin: 1n,
      reservedPayout: 1n,
    });
    const onResolved = vi.fn();
    const { result } = renderHook(() => useLpFreezeActions(onResolved));

    await act(async () => {
      await result.current.finalizeRound(7n);
    });

    expect(sdk.requestCrashAttestation).toHaveBeenCalled();
    expect(sdk.transaction.submit).toHaveBeenCalled();
    expect(sdk.notifyWalletBalancesChanged).toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalled();
    expect(result.current.status).toBe("confirmed");
  });

  it("expires an expiry-eligible blocker without attestation", async () => {
    const { result } = renderHook(() => useLpFreezeActions());

    await act(async () => {
      await result.current.resolveBlockingRound({
        roundId: 3n,
        expiresAt: 1n,
        revealFrozen: false,
        expiryEligible: true,
      });
    });

    expect(sdk.requestCrashAttestation).not.toHaveBeenCalled();
    expect(sdk.transaction.submit).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("confirmed"));
  });

  it("retries an unresolved finalize receipt instead of resubmitting", async () => {
    sdk.readCrashRoundForLp.mockResolvedValue({
      id: 7n,
      status: 2,
      crashRandom:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      openAt: 1n,
      lockAt: 2n,
      expiresAt: 3n,
      crashPointBps: 0n,
      totalMargin: 1n,
      reservedPayout: 1n,
    });
    sdk.wait
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useLpFreezeActions());

    await act(async () => {
      await result.current.finalizeRound(7n);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.retryAction).toBe("finalize-receipt-check");

    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.transaction.submit).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("confirmed");
  });
});
