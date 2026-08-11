// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { encodeFunctionData, erc20Abi } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  submit: vi.fn(),
  getSubmittedHash: vi.fn(),
  submissionError: null as string | null,
  readContract: vi.fn(),
  wait: vi.fn(),
  user: {
    linkedAccounts: [
      {
        type: "wallet",
        address: "0x0000000000000000000000000000000000000003",
        chainType: "ethereum",
        walletClientType: "privy",
      },
    ],
  },
}));

const token = "0x0000000000000000000000000000000000000001";
const vault = "0x0000000000000000000000000000000000000002";
const game = "0x0000000000000000000000000000000000000004";
const roundId = 12n;

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: sdk.user }),
}));
vi.mock("@/lib/base-sepolia", () => ({
  BASE_SEPOLIA_CHAIN_ID: 84532,
  baseSepoliaPublicClient: {
    readContract: (...args: unknown[]) => sdk.readContract(...args),
    waitForTransactionReceipt: (...args: unknown[]) => sdk.wait(...args),
  },
}));
vi.mock("@/lib/bankroll-vault", () => ({
  getBankrollVaultConfig: () => ({ tokenAddress: token, vaultAddress: vault }),
}));
vi.mock("@/lib/margin-call-crash", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/margin-call-crash")>();
  return {
    ...actual,
    getMarginCallCrashConfig: () => ({
      address: game,
      deploymentBlock: 1n,
    }),
    readPlayerTicket: vi.fn(async () => null),
  };
});
vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => ({
    submit: sdk.submit,
    getSubmittedHash: sdk.getSubmittedHash,
    getSubmissionError: () => sdk.submissionError,
  }),
}));

import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { useCrashRoundEntry } from "./use-crash-round-entry";
import { BOUNDED_ENTRY_ALLOWANCE_TUSD } from "@/lib/margin-call-crash";

function mockBalances(allowance = 0n, balance = 100_000_000n) {
  sdk.readContract.mockImplementation(
    async (request: { functionName: string }) => {
      if (request.functionName === "balanceOf") return balance;
      if (request.functionName === "allowance") return allowance;
      if (request.functionName === "getTicketId") return 0n;
      throw new Error(`unexpected ${request.functionName}`);
    }
  );
}

describe("useCrashRoundEntry", () => {
  beforeEach(() => {
    sdk.submit.mockReset().mockResolvedValue(true);
    sdk.getSubmittedHash
      .mockReset()
      .mockReturnValueOnce("0xaaa")
      .mockReturnValueOnce("0xbbb");
    sdk.wait.mockReset().mockResolvedValue({ status: "success" });
    sdk.submissionError = null;
    mockBalances();
  });

  afterEach(() => cleanup());

  it("approves a bounded 1,000 tUSD allowance once, then enters", async () => {
    const { result } = renderHook(() =>
      useCrashRoundEntry({
        roundId,
        phase: "open",
        countdownSeconds: 20,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.enter();
    });

    expect(sdk.submit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: token,
        chainId: 84532,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [vault, BOUNDED_ENTRY_ALLOWANCE_TUSD],
        }),
      })
    );
    expect(sdk.submit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: game, chainId: 84532 })
    );
    expect(sdk.wait).toHaveBeenCalledTimes(2);
    // Never request uint256.max.
    expect(sdk.submit.mock.calls[0][0].data).not.toMatch(/ffffffffffffffff/i);
  });

  it("skips approval when allowance already covers the selected margin", async () => {
    mockBalances(1_000_000n);
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xbbb");
    const { result } = renderHook(() =>
      useCrashRoundEntry({
        roundId,
        phase: "open",
        countdownSeconds: 20,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.needsApproval).toBe(false);
    await act(async () => {
      await result.current.enter();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.submit).toHaveBeenCalledWith(
      expect.objectContaining({ to: game })
    );
  });

  it("re-checks an unresolved entry hash instead of resubmitting", async () => {
    mockBalances(1_000_000n);
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xentry");
    sdk.wait
      .mockRejectedValueOnce(new Error("rpc timeout"))
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() =>
      useCrashRoundEntry({
        roundId,
        phase: "open",
        countdownSeconds: 20,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.enter();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.retryAction).toBe("entry-receipt-check");
    await expect(result.current.enter()).resolves.toBe(false);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.wait).toHaveBeenCalledTimes(2);
  });

  it("classifies a late lock revert as a normal cutoff outcome", async () => {
    mockBalances(1_000_000n);
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xentry");
    sdk.wait.mockResolvedValue({ status: "reverted" });
    const { result } = renderHook(() =>
      useCrashRoundEntry({
        roundId,
        phase: "open",
        countdownSeconds: 20,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.enter();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/normal outcome near lock/);
  });

  it("refreshes on external wallet balance notifications", async () => {
    const { result } = renderHook(() =>
      useCrashRoundEntry({
        roundId,
        phase: "open",
        countdownSeconds: 20,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const readsBefore = sdk.readContract.mock.calls.length;
    mockBalances(5_000_000n, 50_000_000n);
    await act(async () => {
      notifyWalletBalancesChanged();
    });
    await waitFor(() =>
      expect(sdk.readContract.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    await waitFor(() => expect(result.current.allowance).toBe(5_000_000n));
  });
});
