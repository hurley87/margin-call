import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenPosition } from "@/lib/protocol/reads";

const assertWalletOnBaseMock = vi.hoisted(() => vi.fn());
const loadPositionMock = vi.hoisted(() => vi.fn());
const repayAllMock = vi.hoisted(() => vi.fn());
const closePositionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dynamic/resolve-wallet-client", () => ({
  assertWalletOnBase: assertWalletOnBaseMock,
}));

vi.mock("@/lib/protocol/reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/reads")>();
  return {
    ...actual,
    loadPosition: loadPositionMock,
  };
});

vi.mock("@/lib/protocol/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/writes")>();
  return {
    ...actual,
    repayAll: repayAllMock,
    closePosition: closePositionMock,
  };
});

import {
  runClosePositionFlow,
  runRepayAllFlow,
} from "@/lib/protocol/manage-flow";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const EXECUTOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const STRANGER = "0x1111111111111111111111111111111111111111" as const;
const REPAY_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const CLOSE_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

function livePosition(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    status: "open",
    tokenId: 42n,
    assetId: 1,
    stockAmount: 1_000_000_00n,
    principal: 250_000n,
    currentDebt: 250_000n,
    owner: OWNER,
    executor: EXECUTOR,
    nav: 1_250_000n,
    liquidatable: false,
    ...overrides,
  };
}

function stubClients() {
  return {
    walletClient: {
      request: vi.fn(),
      account: { address: OWNER },
    } as never,
    publicClient: {} as never,
  };
}

describe("runRepayAllFlow", () => {
  beforeEach(() => {
    assertWalletOnBaseMock.mockReset();
    loadPositionMock.mockReset();
    repayAllMock.mockReset();
    closePositionMock.mockReset();

    assertWalletOnBaseMock.mockResolvedValue(undefined);
    loadPositionMock
      .mockResolvedValueOnce(livePosition())
      .mockResolvedValueOnce(livePosition({ currentDebt: 0n, principal: 0n }));
    repayAllMock.mockResolvedValue({
      repaid: true,
      receipt: { transactionHash: REPAY_HASH },
    });
  });

  it("re-reads Base debt, repays from the connected wallet, then re-reads", async () => {
    const { walletClient, publicClient } = stubClients();
    const onSubmitted = vi.fn();

    const after = await runRepayAllFlow({
      walletClient,
      publicClient,
      wallet: OWNER,
      tokenId: 42n,
      chainId: 8453,
      onSubmitted,
    });

    expect(assertWalletOnBaseMock).toHaveBeenCalledWith(walletClient);
    expect(loadPositionMock).toHaveBeenCalledTimes(2);
    expect(repayAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        tokenId: 42n,
      })
    );
    expect(after.position.currentDebt).toBe(0n);
    expect(after.hash).toBe(REPAY_HASH);
    expect(closePositionMock).not.toHaveBeenCalled();
  });

  it("reports no hash when there was nothing left to repay", async () => {
    repayAllMock.mockResolvedValue({ repaid: false, receipt: null });
    const { walletClient, publicClient } = stubClients();

    const after = await runRepayAllFlow({
      walletClient,
      publicClient,
      wallet: OWNER,
      tokenId: 42n,
      chainId: 8453,
    });

    expect(after.hash).toBeUndefined();
    expect(after.position.currentDebt).toBe(0n);
  });

  it("refuses a burned token before writing", async () => {
    loadPositionMock.mockReset();
    loadPositionMock.mockResolvedValue({ status: "closed", tokenId: 42n });
    const { walletClient, publicClient } = stubClients();

    await expect(
      runRepayAllFlow({
        walletClient,
        publicClient,
        wallet: OWNER,
        tokenId: 42n,
        chainId: 8453,
      })
    ).rejects.toThrow(/No open position/);

    expect(repayAllMock).not.toHaveBeenCalled();
  });

  it("lets the executor repay", async () => {
    loadPositionMock.mockReset();
    loadPositionMock
      .mockResolvedValueOnce(livePosition())
      .mockResolvedValueOnce(livePosition({ currentDebt: 0n }));

    const { walletClient, publicClient } = stubClients();
    await runRepayAllFlow({
      walletClient,
      publicClient,
      wallet: EXECUTOR,
      tokenId: 42n,
      chainId: 8453,
    });

    expect(repayAllMock).toHaveBeenCalledWith(
      expect.objectContaining({ owner: EXECUTOR, tokenId: 42n })
    );
  });

  it("refuses a stranger before writing", async () => {
    const { walletClient, publicClient } = stubClients();

    await expect(
      runRepayAllFlow({
        walletClient,
        publicClient,
        wallet: STRANGER,
        tokenId: 42n,
        chainId: 8453,
      })
    ).rejects.toThrow(/owner or executor/);

    expect(repayAllMock).not.toHaveBeenCalled();
  });
});

describe("runClosePositionFlow", () => {
  beforeEach(() => {
    assertWalletOnBaseMock.mockReset();
    loadPositionMock.mockReset();
    repayAllMock.mockReset();
    closePositionMock.mockReset();

    assertWalletOnBaseMock.mockResolvedValue(undefined);
    loadPositionMock.mockResolvedValue(
      livePosition({ currentDebt: 0n, principal: 0n })
    );
    closePositionMock.mockResolvedValue({
      tokenId: 42n,
      receipt: { transactionHash: CLOSE_HASH },
    });
  });

  it("closes only after a fresh Base read reports zero debt", async () => {
    const { walletClient, publicClient } = stubClients();

    const result = await runClosePositionFlow({
      walletClient,
      publicClient,
      wallet: OWNER,
      tokenId: 42n,
      chainId: 8453,
    });

    expect(loadPositionMock).toHaveBeenCalledTimes(1);
    expect(closePositionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: 42n })
    );
    expect(result).toEqual({ tokenId: 42n, hash: CLOSE_HASH });
  });

  it("refuses close when the fresh read still has debt", async () => {
    loadPositionMock.mockResolvedValue(livePosition({ currentDebt: 10n }));
    const { walletClient, publicClient } = stubClients();

    await expect(
      runClosePositionFlow({
        walletClient,
        publicClient,
        wallet: OWNER,
        tokenId: 42n,
        chainId: 8453,
      })
    ).rejects.toThrow(/zero/);

    expect(closePositionMock).not.toHaveBeenCalled();
  });

  it("refuses close for an executor even at zero debt", async () => {
    const { walletClient, publicClient } = stubClients();

    await expect(
      runClosePositionFlow({
        walletClient,
        publicClient,
        wallet: EXECUTOR,
        tokenId: 42n,
        chainId: 8453,
      })
    ).rejects.toThrow(/owner can close/);

    expect(closePositionMock).not.toHaveBeenCalled();
  });

  it("refuses a burned token before writing", async () => {
    loadPositionMock.mockResolvedValue({ status: "closed", tokenId: 42n });
    const { walletClient, publicClient } = stubClients();

    await expect(
      runClosePositionFlow({
        walletClient,
        publicClient,
        wallet: OWNER,
        tokenId: 42n,
        chainId: 8453,
      })
    ).rejects.toThrow(/No open position/);

    expect(closePositionMock).not.toHaveBeenCalled();
  });
});
