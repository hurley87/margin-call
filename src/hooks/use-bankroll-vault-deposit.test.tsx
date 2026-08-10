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
});
