// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  submit: vi.fn(),
  getSubmittedHash: vi.fn(),
  submissionError: null as string | null,
  wait: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/base-sepolia", () => ({
  BASE_SEPOLIA_CHAIN_ID: 84532,
  baseSepoliaPublicClient: {
    waitForTransactionReceipt: (...args: unknown[]) => sdk.wait(...args),
  },
}));
vi.mock("@/lib/desk-dollars", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/desk-dollars")>(
      "@/lib/desk-dollars"
    );
  return {
    ...actual,
    getDeskDollarsTokenAddress: () =>
      "0x0000000000000000000000000000000000000001",
  };
});
vi.mock("@/lib/wallet-balance-sync", () => ({
  notifyWalletBalancesChanged: () => sdk.notify(),
}));
vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => ({
    submit: sdk.submit,
    getSubmittedHash: sdk.getSubmittedHash,
    getSubmissionError: () => sdk.submissionError,
  }),
}));

import { useDeskDollarsTransfer } from "./use-desk-dollars-transfer";

const FROM = "0x0000000000000000000000000000000000000003" as const;
const TO = "0x0000000000000000000000000000000000000004" as const;

describe("useDeskDollarsTransfer", () => {
  beforeEach(() => {
    sdk.submit.mockReset().mockResolvedValue(true);
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xabc");
    sdk.submissionError = null;
    sdk.wait.mockReset().mockResolvedValue({ status: "success" });
    sdk.notify.mockReset();
  });

  afterEach(() => cleanup());

  it("keeps a transfer pending until a successful receipt, then notifies balances", async () => {
    let resolveReceipt: (value: { status: "success" }) => void;
    sdk.wait.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        })
    );
    const { result } = renderHook(() => useDeskDollarsTransfer(FROM));

    act(() => {
      void result.current.transfer({
        recipient: TO,
        amount: "10",
        balance: 100_000_000n,
      });
    });
    await waitFor(() => expect(result.current.status).toBe("pending"));
    expect(result.current.canTransfer).toBe(false);

    await act(async () => {
      resolveReceipt!({ status: "success" });
    });
    await waitFor(() => expect(result.current.status).toBe("confirmed"));
    expect(sdk.notify).toHaveBeenCalledTimes(1);
    expect(sdk.wait).toHaveBeenCalledWith({ hash: "0xabc" });
  });

  it("re-checks the same transfer hash after a receipt-wait failure instead of resubmitting", async () => {
    sdk.wait
      .mockRejectedValueOnce(new Error("rpc timeout"))
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useDeskDollarsTransfer(FROM));

    await act(async () => {
      await result.current.transfer({
        recipient: TO,
        amount: "5",
        balance: 100_000_000n,
      });
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Your transfer was submitted, but we couldn't confirm it yet. Retry to check its status."
    );

    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.wait).toHaveBeenCalledTimes(2);
    expect(sdk.wait).toHaveBeenNthCalledWith(2, { hash: "0xabc" });
    await waitFor(() => expect(result.current.status).toBe("confirmed"));
  });

  it("retries a submission failure with the same transfer request", async () => {
    sdk.submit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = renderHook(() => useDeskDollarsTransfer(FROM));

    await act(async () => {
      await result.current.transfer({
        recipient: TO,
        amount: "1",
        balance: 100_000_000n,
      });
    });
    expect(result.current.canRetry).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
    expect(sdk.submit.mock.calls[1][0]).toEqual(sdk.submit.mock.calls[0][0]);
    expect(sdk.submit.mock.calls[0][0]).toMatchObject({
      to: "0x0000000000000000000000000000000000000001",
      chainId: 84532,
    });
  });

  it("surfaces validation failures without submitting", async () => {
    const { result } = renderHook(() => useDeskDollarsTransfer(FROM));

    await act(async () => {
      await result.current.transfer({
        recipient: FROM,
        amount: "1",
        balance: 100_000_000n,
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Cannot transfer to your own wallet.");
    expect(result.current.canRetry).toBe(false);
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("suppresses duplicate transfers while one submission is in flight", async () => {
    let resolveSubmit: (value: boolean) => void;
    sdk.submit.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { result } = renderHook(() => useDeskDollarsTransfer(FROM));

    let first: Promise<boolean>;
    let duplicate: Promise<boolean>;
    act(() => {
      first = result.current.transfer({
        recipient: TO,
        amount: "1",
        balance: 100_000_000n,
      });
      duplicate = result.current.transfer({
        recipient: TO,
        amount: "1",
        balance: 100_000_000n,
      });
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await expect(duplicate!).resolves.toBe(false);
    await act(async () => {
      resolveSubmit!(true);
      await first!;
    });
  });
});
