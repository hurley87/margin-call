import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEVERAGE_1_25X,
  ORACLE_STATE,
  SPOT_LEVERAGE,
} from "@/lib/protocol/constants";
import { getAssetByName } from "@/lib/protocol/deployment";
import type { OpenSnapshot } from "@/lib/protocol/reads";

const assertWalletOnBaseMock = vi.hoisted(() => vi.fn());
const loadOpenSnapshotMock = vi.hoisted(() => vi.fn());
const approveUnlimitedMock = vi.hoisted(() => vi.fn());
const openPositionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dynamic/resolve-wallet-client", () => ({
  assertWalletOnBase: assertWalletOnBaseMock,
}));

vi.mock("@/lib/protocol/reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/reads")>();
  return {
    ...actual,
    loadOpenSnapshot: loadOpenSnapshotMock,
  };
});

vi.mock("@/lib/protocol/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/writes")>();
  return {
    ...actual,
    approveUnlimited: approveUnlimitedMock,
    openPosition: openPositionMock,
  };
});

import { runOpenPositionFlow } from "@/lib/protocol/open-flow";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;
const OPEN_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const APPROVE_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const asset = getAssetByName("NVDAc");

function readySnapshot(overrides: Partial<OpenSnapshot> = {}): OpenSnapshot {
  return {
    stockBalance: 1_000_000_00n,
    stockAllowance: 1_000_000_00n,
    availableCredit: 10_000_000_000n,
    oracleState: ORACLE_STATE.LIVE,
    estimatedPrincipal: 100_000n,
    ...overrides,
  };
}

function stubClients() {
  return {
    walletClient: {
      request: vi.fn(),
      account: { address: ADDRESS },
    } as never,
    publicClient: {} as never,
  };
}

describe("runOpenPositionFlow", () => {
  beforeEach(() => {
    assertWalletOnBaseMock.mockReset();
    loadOpenSnapshotMock.mockReset();
    approveUnlimitedMock.mockReset();
    openPositionMock.mockReset();

    assertWalletOnBaseMock.mockResolvedValue(undefined);
    loadOpenSnapshotMock.mockResolvedValue(readySnapshot());
    openPositionMock.mockResolvedValue({
      tokenId: 42n,
      receipt: { transactionHash: OPEN_HASH, logs: [] },
    });
  });

  it("opens after fresh readiness without approval when allowance covers amount", async () => {
    const { walletClient, publicClient } = stubClients();
    const onSubmitted = vi.fn();

    const result = await runOpenPositionFlow({
      walletClient,
      publicClient,
      address: ADDRESS,
      asset,
      stockAmount: 1_000_000n,
      targetLeverage: LEVERAGE_1_25X,
      thesis: "",
      chainId: 8453,
      onSubmitted,
    });

    expect(assertWalletOnBaseMock).toHaveBeenCalledWith(walletClient);
    expect(loadOpenSnapshotMock).toHaveBeenCalledTimes(1);
    expect(approveUnlimitedMock).not.toHaveBeenCalled();
    expect(openPositionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: BigInt(asset.assetId),
        stockAmount: 1_000_000n,
        targetLeverage: BigInt(LEVERAGE_1_25X),
        thesis: "",
      })
    );
    expect(result).toEqual({ tokenId: 42n, hash: OPEN_HASH });
  });

  it("forwards the caller's thesis to the open write", async () => {
    const { walletClient, publicClient } = stubClients();

    await runOpenPositionFlow({
      walletClient,
      publicClient,
      address: ADDRESS,
      asset,
      stockAmount: 1_000_000n,
      targetLeverage: LEVERAGE_1_25X,
      thesis: "AI capex stays underpriced.",
      chainId: 8453,
    });

    expect(openPositionMock).toHaveBeenCalledWith(
      expect.objectContaining({ thesis: "AI capex stays underpriced." })
    );
  });

  it("approves then re-reads before open when allowance is short", async () => {
    loadOpenSnapshotMock
      .mockResolvedValueOnce(
        readySnapshot({ stockAllowance: 0n, stockBalance: 1_000_000_00n })
      )
      .mockResolvedValueOnce(readySnapshot({ stockAllowance: 1_000_000_00n }));

    approveUnlimitedMock.mockResolvedValue({
      transactionHash: APPROVE_HASH,
    });

    const { walletClient, publicClient } = stubClients();
    const onSubmitted = vi.fn();

    const result = await runOpenPositionFlow({
      walletClient,
      publicClient,
      address: ADDRESS,
      asset,
      stockAmount: 1_000_000n,
      targetLeverage: LEVERAGE_1_25X,
      thesis: "",
      chainId: 8453,
      onSubmitted,
    });

    expect(approveUnlimitedMock).toHaveBeenCalledTimes(1);
    expect(loadOpenSnapshotMock).toHaveBeenCalledTimes(2);
    expect(openPositionMock).toHaveBeenCalledTimes(1);
    expect(result.tokenId).toBe(42n);
    expect(result.hash).toBe(OPEN_HASH);
  });

  it("aborts before any write when readiness fails", async () => {
    loadOpenSnapshotMock.mockResolvedValue(
      readySnapshot({
        stockBalance: 0n,
        stockAllowance: 0n,
      })
    );

    const { walletClient, publicClient } = stubClients();

    await expect(
      runOpenPositionFlow({
        walletClient,
        publicClient,
        address: ADDRESS,
        asset,
        stockAmount: 1_000_000n,
        targetLeverage: LEVERAGE_1_25X,
        thesis: "",
        chainId: 8453,
      })
    ).rejects.toThrow(/Insufficient selected-stock balance/);

    expect(approveUnlimitedMock).not.toHaveBeenCalled();
    expect(openPositionMock).not.toHaveBeenCalled();
  });

  it("allows spot open without LIVE oracle or credit sizing", async () => {
    loadOpenSnapshotMock.mockResolvedValue(
      readySnapshot({
        oracleState: null,
        estimatedPrincipal: 0n,
        availableCredit: 0n,
      })
    );

    const { walletClient, publicClient } = stubClients();

    const result = await runOpenPositionFlow({
      walletClient,
      publicClient,
      address: ADDRESS,
      asset,
      stockAmount: 1_000_000n,
      targetLeverage: SPOT_LEVERAGE,
      thesis: "",
      chainId: 8453,
    });

    expect(openPositionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLeverage: BigInt(SPOT_LEVERAGE),
      })
    );
    expect(result.tokenId).toBe(42n);
  });

  it("returns the tokenId from the open receipt, not caller-supplied fields", async () => {
    openPositionMock.mockResolvedValue({
      tokenId: 99n,
      receipt: { transactionHash: OPEN_HASH, logs: [] },
    });

    const { walletClient, publicClient } = stubClients();

    const result = await runOpenPositionFlow({
      walletClient,
      publicClient,
      address: ADDRESS,
      asset,
      stockAmount: 1_000_000n,
      targetLeverage: LEVERAGE_1_25X,
      thesis: "",
      chainId: 8453,
    });

    expect(result.tokenId).toBe(99n);
    expect(result.hash).toBe(OPEN_HASH);
  });

  it("rejects wrong-network before snapshot or writes", async () => {
    assertWalletOnBaseMock.mockRejectedValue(
      new Error("Wrong network. Expected Base (8453), got 0x1.")
    );

    const { walletClient, publicClient } = stubClients();

    await expect(
      runOpenPositionFlow({
        walletClient,
        publicClient,
        address: ADDRESS,
        asset,
        stockAmount: 1_000_000n,
        targetLeverage: LEVERAGE_1_25X,
        thesis: "",
        chainId: 1,
      })
    ).rejects.toThrow(/Wrong network/);

    expect(loadOpenSnapshotMock).not.toHaveBeenCalled();
    expect(openPositionMock).not.toHaveBeenCalled();
  });
});
