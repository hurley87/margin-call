// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  submit: vi.fn(),
  getSubmittedHash: vi.fn(),
  submissionError: null as string | null,
  read: vi.fn(),
  wait: vi.fn(),
}));

vi.mock("@/lib/desk-dollars", () => ({
  getDeskDollarsConfig: () => ({
    tokenAddress: "0x0000000000000000000000000000000000000001",
    faucetAddress: "0x0000000000000000000000000000000000000002",
  }),
  deskDollarsFaucetAbi: [
    {
      type: "function",
      name: "claim",
      stateMutability: "nonpayable",
      inputs: [],
      outputs: [],
    },
  ],
  deskDollarsPublicClient: {
    waitForTransactionReceipt: (...args: unknown[]) => sdk.wait(...args),
  },
  readDeskDollarsState: (...args: unknown[]) => sdk.read(...args),
}));
vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => ({
    submit: sdk.submit,
    getSubmittedHash: sdk.getSubmittedHash,
    getSubmissionError: () => sdk.submissionError,
  }),
}));

import { useDeskDollarsFaucet } from "./use-desk-dollars-faucet";

describe("useDeskDollarsFaucet", () => {
  beforeEach(() => {
    sdk.submit.mockReset().mockResolvedValue(true);
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xabc");
    sdk.submissionError = null;
    sdk.read
      .mockReset()
      .mockResolvedValue({ balance: 100000000n, decimals: 6, nextClaimAt: 0n });
    sdk.wait.mockReset().mockResolvedValue({ status: "success" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps a claim pending until a successful receipt, then refreshes authoritative reads", async () => {
    let resolveReceipt: (value: { status: "success" }) => void;
    sdk.wait.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        })
    );
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      void result.current.claim();
    });
    expect(result.current.status).toBe("pending");
    expect(result.current.canClaim).toBe(false);
    await waitFor(() => expect(sdk.wait).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveReceipt!({ status: "success" });
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(sdk.wait).toHaveBeenCalledWith({ hash: "0xabc" });
    expect(sdk.read).toHaveBeenCalledTimes(2);
  });

  it("fails a reverted receipt and genuinely resubmits the same sponsored claim on retry", async () => {
    sdk.wait
      .mockResolvedValueOnce({ status: "reverted" })
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.canRetry).toBe(true);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
    expect(sdk.submit.mock.calls[1][0]).toEqual(sdk.submit.mock.calls[0][0]);
  });

  it("reports an initial read failure without claiming confirmation and retries only the read", async () => {
    sdk.read.mockRejectedValueOnce(new Error("rpc unavailable"));
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(
      "We couldn't load your Desk Dollars balance and faucet eligibility. Please try again."
    );
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.read).toHaveBeenCalledTimes(2);
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("keeps confirmed-claim wording after a receipt refresh failure and retries only the read", async () => {
    sdk.read
      .mockResolvedValueOnce({
        balance: 100000000n,
        decimals: 6,
        nextClaimAt: 0n,
      })
      .mockRejectedValueOnce(new Error("rpc unavailable"))
      .mockResolvedValueOnce({
        balance: 200000000n,
        decimals: 6,
        nextClaimAt: 3600n,
      });
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.error).toBe(
      "Your claim was confirmed, but we couldn't refresh your Desk Dollars balance. Please try again."
    );
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.read).toHaveBeenCalledTimes(3);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate claims while one submission is in flight", async () => {
    let resolveSubmit: (value: boolean) => void;
    sdk.submit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let first: Promise<boolean>;
    let duplicate: Promise<boolean>;
    act(() => {
      first = result.current.claim();
      duplicate = result.current.claim();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await expect(duplicate!).resolves.toBe(false);
    await act(async () => {
      resolveSubmit!(true);
      await first!;
    });
  });

  it("surfaces the submission failure reason recorded by that same claim", async () => {
    sdk.submit.mockImplementation(async () => {
      sdk.submissionError = "Your wallet is not ready. Please try again.";
      return false;
    });
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Your wallet is not ready. Please try again."
    );
  });

  it("counts a pending cooldown down and re-enables claiming at the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    sdk.read.mockResolvedValue({
      balance: 100000000n,
      decimals: 6,
      nextClaimAt: 1_000_000_002n,
    });
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await act(async () => {});
    expect(result.current.status).toBe("ready");
    expect(result.current.eligible).toBe(false);
    expect(result.current.canClaim).toBe(false);
    expect(result.current.cooldownSeconds).toBe(2n);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.eligible).toBe(true);
    expect(result.current.canClaim).toBe(true);
    expect(result.current.cooldownSeconds).toBe(0n);
  });

  it("retries a submission failure with the same claim request", async () => {
    sdk.submit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = renderHook(() =>
      useDeskDollarsFaucet("0x0000000000000000000000000000000000000003")
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.canRetry).toBe(true);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
    expect(sdk.submit.mock.calls[1][0]).toEqual(sdk.submit.mock.calls[0][0]);
    expect(sdk.submit.mock.calls[0][0]).toMatchObject({
      to: "0x0000000000000000000000000000000000000002",
      chainId: 84532,
      data: "0x4e71d92d",
    });
  });
});
