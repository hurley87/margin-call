// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { encodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  submit: vi.fn(),
  getSubmittedHash: vi.fn(),
  submissionError: null as string | null,
  read: vi.fn(),
  wait: vi.fn(),
}));
const wallet = "0x0000000000000000000000000000000000000003";
const token = "0x0000000000000000000000000000000000000001";
const vault = "0x0000000000000000000000000000000000000002";
const readyValues = (allowance = 0n) => ({
  tUsdBalance: 100000000n,
  shareBalance: 0n,
  allowance,
  grossAssets: 25000000000n,
  totalAssets: 25000000000n,
  totalSupply: 25000000000n,
  assetsPerShare: 1000000n,
  pendingObligations: 0n,
  unrecognizedMargin: 0n,
  reservedLiabilities: 0n,
  safetyBuffer: 5000000000n,
  freeLiquidity: 20000000000n,
  maxWithdraw: 20000000000n,
  maxRedeem: 20000000000n,
});

vi.mock("@/lib/base-sepolia", () => ({
  BASE_SEPOLIA_CHAIN_ID: 84532,
  baseSepoliaPublicClient: {
    waitForTransactionReceipt: (...args: unknown[]) => sdk.wait(...args),
  },
}));
vi.mock("@/lib/bankroll-vault", () => ({
  getBankrollVaultConfig: () => ({ tokenAddress: token, vaultAddress: vault }),
  bankrollVaultAbi: [
    {
      type: "function",
      name: "deposit",
      stateMutability: "nonpayable",
      inputs: [
        { name: "assets", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      outputs: [{ name: "shares", type: "uint256" }],
    },
    {
      type: "function",
      name: "withdraw",
      stateMutability: "nonpayable",
      inputs: [
        { name: "assets", type: "uint256" },
        { name: "receiver", type: "address" },
        { name: "owner", type: "address" },
      ],
      outputs: [{ name: "shares", type: "uint256" }],
    },
  ],
  readBankrollVaultState: (...args: unknown[]) => sdk.read(...args),
}));
vi.mock("./use-privy-sponsored-transaction", () => ({
  usePrivySponsoredTransaction: () => ({
    submit: sdk.submit,
    getSubmittedHash: sdk.getSubmittedHash,
    getSubmissionError: () => sdk.submissionError,
  }),
}));

import { notifyWalletBalancesChanged } from "@/lib/wallet-balance-sync";
import { useBankrollVaultDeposit } from "./use-bankroll-vault-deposit";

describe("useBankrollVaultDeposit", () => {
  beforeEach(() => {
    sdk.submit.mockReset().mockResolvedValue(true);
    sdk.getSubmittedHash
      .mockReset()
      .mockReturnValueOnce("0xaaa")
      .mockReturnValueOnce("0xbbb");
    sdk.read.mockReset().mockResolvedValue(readyValues());
    sdk.wait.mockReset().mockResolvedValue({ status: "success" });
    sdk.submissionError = null;
  });
  afterEach(() => cleanup());

  it("reads every authoritative wallet and vault value", async () => {
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject(readyValues());
    expect(sdk.read).toHaveBeenCalledWith(
      { tokenAddress: token, vaultAddress: vault },
      wallet
    );
  });

  it("approves the exact amount, waits for both receipts, and only then refreshes", async () => {
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(sdk.submit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: token,
        chainId: 84532,
        data: "0x095ea7b30000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000007b",
      })
    );
    expect(sdk.submit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: vault, chainId: 84532 })
    );
    expect(sdk.wait).toHaveBeenNthCalledWith(1, { hash: "0xaaa" });
    expect(sdk.wait).toHaveBeenNthCalledWith(2, { hash: "0xbbb" });
    expect(sdk.read).toHaveBeenCalledTimes(2);
  });

  it("skips approval when allowance already covers the asset-denominated deposit", async () => {
    sdk.read.mockResolvedValue(readyValues(123n));
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xbbb");
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.submit).toHaveBeenCalledWith(
      expect.objectContaining({ to: vault, chainId: 84532 })
    );
  });

  it("retries a failed approval from the approval stage before depositing", async () => {
    sdk.submit
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    sdk.getSubmittedHash
      .mockReset()
      .mockReturnValueOnce("0xaaa")
      .mockReturnValueOnce("0xbbb");
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.status).toBe("error");
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(3);
    expect(sdk.submit.mock.calls[0][0].to).toBe(token);
    expect(sdk.submit.mock.calls[1][0].to).toBe(token);
    expect(sdk.submit.mock.calls[2][0].to).toBe(vault);
  });

  it("does not treat a reverted receipt as confirmed and retries only the failed deposit", async () => {
    sdk.read.mockResolvedValue(readyValues(123n));
    sdk.getSubmittedHash.mockReturnValue("0xbbb");
    sdk.wait
      .mockResolvedValueOnce({ status: "reverted" })
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.status).toBe("error");
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
    expect(
      sdk.submit.mock.calls.every(([request]) => request.to === vault)
    ).toBe(true);
  });

  it("re-checks the same deposit hash after a receipt-wait failure instead of resubmitting", async () => {
    sdk.read.mockResolvedValue(readyValues(123n));
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xbbb");
    sdk.wait
      .mockReset()
      .mockRejectedValueOnce(new Error("rpc timeout"))
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Your LP deposit was submitted, but we couldn't confirm it yet. Retry to check its status."
    );
    expect(result.current.canDeposit).toBe(false);
    expect(result.current.canRetry).toBe(true);
    await expect(result.current.deposit(50n)).resolves.toBe(false);
    await expect(result.current.withdraw(50n)).resolves.toBe(false);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.wait).toHaveBeenCalledTimes(2);
    expect(sdk.wait).toHaveBeenNthCalledWith(2, { hash: "0xbbb" });
    expect(result.current.status).toBe("ready");
  });

  it("keeps an unresolved approval as the only recoverable operation", async () => {
    sdk.getSubmittedHash
      .mockReset()
      .mockReturnValueOnce("0xapproval")
      .mockReturnValueOnce("0xdeposit");
    sdk.wait
      .mockRejectedValueOnce(new Error("rpc timeout"))
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    await expect(result.current.deposit(50n)).resolves.toBe(false);
    await expect(result.current.withdraw(50n)).resolves.toBe(false);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.wait).toHaveBeenNthCalledWith(2, { hash: "0xapproval" });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
  });

  it("accepts a different amount after a resolved deposit failure", async () => {
    sdk.read.mockResolvedValue(readyValues(123n));
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xbbb");
    sdk.wait
      .mockReset()
      .mockResolvedValueOnce({ status: "reverted" })
      .mockResolvedValue({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.canDeposit).toBe(true);
    await act(async () => {
      await result.current.deposit(50n);
    });
    expect(result.current.status).toBe("ready");
    expect(sdk.submit).toHaveBeenCalledTimes(2);
  });

  it("surfaces the deposit-stage submission failure reason", async () => {
    sdk.read.mockResolvedValue(readyValues(123n));
    sdk.submit.mockImplementation(async () => {
      sdk.submissionError = "Your wallet is not ready. Please try again.";
      return false;
    });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Your wallet is not ready. Please try again."
    );
  });

  it("re-reads balances when a sibling panel changes wallet balances", async () => {
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    sdk.read.mockResolvedValue({ ...readyValues(), tUsdBalance: 200000000n });
    await act(async () => {
      notifyWalletBalancesChanged();
    });
    await waitFor(() => expect(result.current.tUsdBalance).toBe(200000000n));
    expect(result.current.status).toBe("ready");
  });

  it("suppresses duplicate in-flight deposits", async () => {
    let resolveSubmit: (value: boolean) => void;
    sdk.submit
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSubmit = resolve;
          })
      )
      .mockResolvedValue(true);
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let first: Promise<boolean>;
    let duplicate: Promise<boolean>;
    act(() => {
      first = result.current.deposit(123n);
      duplicate = result.current.deposit(123n);
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await expect(duplicate!).resolves.toBe(false);
    await act(async () => {
      resolveSubmit!(true);
      await first!;
    });
  });

  it("never resends a confirmed deposit if the post-confirmation refresh fails", async () => {
    sdk.read
      .mockResolvedValueOnce(readyValues(123n))
      .mockRejectedValueOnce(new Error("rpc"));
    sdk.getSubmittedHash.mockReturnValue("0xbbb");
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.deposit(123n);
    });
    expect(result.current.error).toBe(
      "Your deposit was confirmed, but we couldn't refresh the Bankroll Vault. Please try again."
    );
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.read).toHaveBeenCalledTimes(3);
  });

  it("submits exact asset-denominated withdrawal calldata and leaves balances authoritative until receipt confirmation", async () => {
    let resolveWait: (receipt: { status: string }) => void;
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xwithdraw");
    sdk.wait.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWait = resolve;
        })
    );
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = result.current.tUsdBalance;
    let withdrawal: Promise<boolean>;
    act(() => {
      withdrawal = result.current.withdraw(123n);
    });
    await waitFor(() =>
      expect(result.current.status).toBe("withdrawal-pending")
    );
    expect(result.current.tUsdBalance).toBe(before);
    expect(sdk.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        to: vault,
        chainId: 84532,
        data: encodeFunctionData({
          abi: [
            {
              type: "function",
              name: "withdraw",
              stateMutability: "nonpayable",
              inputs: [
                { name: "assets", type: "uint256" },
                { name: "receiver", type: "address" },
                { name: "owner", type: "address" },
              ],
              outputs: [{ name: "shares", type: "uint256" }],
            },
          ],
          functionName: "withdraw",
          args: [123n, wallet, wallet],
        }),
      })
    );
    await act(async () => {
      resolveWait!({ status: "success" });
      await withdrawal!;
    });
    expect(sdk.read).toHaveBeenCalledTimes(2);
  });

  it("re-checks an unresolved withdrawal hash instead of resubmitting it", async () => {
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xwithdraw");
    sdk.wait
      .mockRejectedValueOnce(new Error("rpc timeout"))
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.withdraw(123n);
    });
    expect(result.current.canWithdraw).toBe(false);
    expect(result.current.withdrawalStatus).toBe("confirmation-unknown");
    await expect(result.current.deposit(50n)).resolves.toBe(false);
    await expect(result.current.withdraw(50n)).resolves.toBe(false);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    expect(sdk.wait).toHaveBeenNthCalledWith(2, { hash: "0xwithdraw" });
  });

  it("refreshes the authoritative limit after a reverted withdrawal before accepting a corrected retry", async () => {
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xwithdraw");
    sdk.read
      .mockResolvedValueOnce(readyValues())
      .mockResolvedValueOnce({
        ...readyValues(),
        maxWithdraw: 50n,
        freeLiquidity: 50n,
      })
      .mockResolvedValueOnce(readyValues());
    sdk.wait
      .mockResolvedValueOnce({ status: "reverted" })
      .mockResolvedValueOnce({ status: "success" });
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.withdraw(123n);
    });
    expect(result.current.maxWithdraw).toBe(50n);
    expect(result.current.canWithdraw).toBe(true);
    expect(result.current.canRetry).toBe(false);
    await expect(result.current.retry()).resolves.toBe(false);
    expect(sdk.submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.withdraw(50n);
    });
    expect(sdk.submit).toHaveBeenCalledTimes(2);
  });

  it("retries only the authoritative refresh after a confirmed withdrawal", async () => {
    sdk.getSubmittedHash.mockReset().mockReturnValue("0xwithdraw");
    sdk.read
      .mockResolvedValueOnce(readyValues())
      .mockRejectedValueOnce(new Error("rpc"))
      .mockResolvedValueOnce(readyValues());
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.withdraw(123n);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.withdrawalStatus).toBe("refresh-after-confirmation");
    await act(async () => {
      await result.current.retry();
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate in-flight withdrawals", async () => {
    let resolveSubmit: (value: boolean) => void;
    sdk.submit.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { result } = renderHook(() => useBankrollVaultDeposit(wallet));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let first: Promise<boolean>;
    let duplicate: Promise<boolean>;
    act(() => {
      first = result.current.withdraw(123n);
      duplicate = result.current.withdraw(123n);
    });
    await expect(duplicate!).resolves.toBe(false);
    await act(async () => {
      resolveSubmit!(true);
      await first!;
    });
    expect(sdk.submit).toHaveBeenCalledTimes(1);
  });
});
