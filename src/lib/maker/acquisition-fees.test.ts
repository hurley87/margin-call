import { describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";

import {
  acquisitionFeeTotal,
  claimAcquisitionFees,
  readAcquisitionFeeSnapshot,
  type AcquisitionFeeClaimAdapter,
  type AcquisitionFeeReadClient,
  type ClaimPhase,
} from "./acquisition-fees";

const WALLET = "0x0000000000000000000000000000000000000001" as Address;
const OTHER = "0x0000000000000000000000000000000000000002" as Address;
const RIP_ENGINE = "0x0000000000000000000000000000000000000003" as Address;
const MOCK_USD = "0x0000000000000000000000000000000000000004" as Address;
const HASH = `0x${"1".repeat(64)}` as Hash;

describe("live Acquisition Fee accounting", () => {
  it("adds crystallized and per-Pack pending stablecoin amounts", () => {
    expect(acquisitionFeeTotal(12n, [3n, 4n, 5n])).toEqual({
      pending: 12n,
      total: 24n,
    });
  });

  it("filters the complete live resting set by Maker and chunks multicalls", async () => {
    const restingPackIds = Array.from({ length: 205 }, (_, index) =>
      BigInt(index + 1)
    );
    const makerIds = new Set([2n, 104n, 205n]);
    const readContract = vi.fn(
      async ({
        functionName,
      }: {
        functionName: string;
        blockNumber: bigint;
      }) => {
        switch (functionName) {
          case "restingPackIds":
            return restingPackIds;
          case "restingCount":
            return 205n;
          case "claimableFees":
            return 7n;
          case "balanceOf":
            return 99n;
          case "decimals":
            return 6;
          default:
            throw new Error(`Unexpected read ${functionName}`);
        }
      }
    );
    const multicall = vi.fn(
      async ({
        contracts,
      }: {
        contracts: Array<Record<string, unknown>>;
        blockNumber: bigint;
      }) =>
        contracts.map((contract) => {
          const tokenId = (contract.args as [bigint])[0];
          return contract.functionName === "makerOf"
            ? makerIds.has(tokenId)
              ? WALLET
              : OTHER
            : tokenId;
        })
    );
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(123n),
      readContract,
      multicall,
    } as unknown as AcquisitionFeeReadClient;

    const snapshot = await readAcquisitionFeeSnapshot(
      client,
      { ripEngine: RIP_ENGINE, mockUsd: MOCK_USD },
      WALLET
    );

    expect(snapshot).toEqual({
      blockNumber: 123n,
      crystallized: 7n,
      pending: 311n,
      total: 318n,
      mockUsdBalance: 99n,
      stablecoinDecimals: 6,
      restingMakerTokenIds: [2n, 104n, 205n],
    });
    const makerCalls = multicall.mock.calls.filter(
      ([input]) => input.contracts[0]?.functionName === "makerOf"
    );
    expect(makerCalls.map(([input]) => input.contracts.length)).toEqual([
      100, 100, 5,
    ]);
    expect(
      readContract.mock.calls.every(([input]) => input.blockNumber === 123n)
    ).toBe(true);
    expect(
      multicall.mock.calls.every(([input]) => input.blockNumber === 123n)
    ).toBe(true);
  });

  it("fails instead of silently undercounting an incomplete resting set", async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(123n),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          switch (functionName) {
            case "restingPackIds":
              return [1n];
            case "restingCount":
              return 2n;
            case "claimableFees":
            case "balanceOf":
              return 0n;
            case "decimals":
              return 6;
            default:
              throw new Error(`Unexpected read ${functionName}`);
          }
        }
      ),
      multicall: vi.fn(),
    } as unknown as AcquisitionFeeReadClient;

    await expect(
      readAcquisitionFeeSnapshot(
        client,
        { ripEngine: RIP_ENGINE, mockUsd: MOCK_USD },
        WALLET
      )
    ).rejects.toThrow(
      "Incomplete live resting set: expected 2 Packs, received 1"
    );
    expect(client.multicall).not.toHaveBeenCalled();
  });
});

describe("Acquisition Fee claim lifecycle", () => {
  it("submits an empty token list for a crystallized-only claim", async () => {
    const adapter: AcquisitionFeeClaimAdapter = {
      claim: vi.fn().mockResolvedValue(HASH),
      waitForReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    };

    await claimAcquisitionFees(
      [],
      adapter,
      () => undefined,
      async () => undefined
    );

    expect(adapter.claim).toHaveBeenCalledWith([]);
  });

  it("keeps a submitted hash pending and refreshes only after confirmation", async () => {
    let resolveReceipt!: (receipt: { status: "success" }) => void;
    const receiptPromise = new Promise<{ status: "success" }>((resolve) => {
      resolveReceipt = resolve;
    });
    const phases: ClaimPhase[] = [];
    const refresh = vi.fn();
    const adapter: AcquisitionFeeClaimAdapter = {
      claim: vi.fn().mockResolvedValue(HASH),
      waitForReceipt: vi.fn().mockReturnValue(receiptPromise),
    };

    const claiming = claimAcquisitionFees(
      [42n],
      adapter,
      (phase) => phases.push(phase),
      refresh
    );
    await vi.waitFor(() =>
      expect(phases.at(-1)).toEqual({ kind: "pending", hash: HASH })
    );
    expect(refresh).not.toHaveBeenCalled();

    resolveReceipt({ status: "success" });
    await claiming;

    expect(phases.map((phase) => phase.kind)).toEqual([
      "signing",
      "pending",
      "complete",
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("surfaces wallet rejection without waiting or refreshing", async () => {
    const adapter: AcquisitionFeeClaimAdapter = {
      claim: vi.fn().mockRejectedValue(new Error("User rejected request")),
      waitForReceipt: vi.fn(),
    };
    const refresh = vi.fn();

    await expect(
      claimAcquisitionFees([1n], adapter, () => undefined, refresh)
    ).rejects.toThrow("User rejected request");
    expect(adapter.waitForReceipt).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats a reverted receipt as failure and does not refresh", async () => {
    const adapter: AcquisitionFeeClaimAdapter = {
      claim: vi.fn().mockResolvedValue(HASH),
      waitForReceipt: vi.fn().mockResolvedValue({ status: "reverted" }),
    };
    const refresh = vi.fn();

    await expect(
      claimAcquisitionFees([1n], adapter, () => undefined, refresh)
    ).rejects.toThrow("Acquisition Fee claim transaction reverted");
    expect(refresh).not.toHaveBeenCalled();
  });
});
