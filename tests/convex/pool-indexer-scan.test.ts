import {
  BaseError,
  ContractFunctionRevertedError,
  encodeEventTopics,
  HttpRequestError,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "../../convex/_generated/server";
import { ripEngineAbi } from "../../convex/lib/chain/abis";
import {
  applyRipEngineLog,
  isContractCallRevert,
  MAX_BLOCK_SPAN,
  readNavOfPack,
  scanLogs,
  tryDecodeEventLog,
} from "../../convex/lib/poolIndexerHandlers";

const ZERO_ADDR = "0x0000000000000000000000000000000000000001" as const;
const RIP = "0x00000000000000000000000000000000000000aa" as const;
const PACK = "0x00000000000000000000000000000000000000bb" as const;

function makeCtx(overrides?: {
  cursor?: number | null;
  onSetCursor?: (blockNumber: number) => void;
  onUpsertPack?: () => Promise<void>;
}): ActionCtx {
  const setCursor = vi.fn(
    async (_ref: unknown, args: { key: string; blockNumber: number }) => {
      overrides?.onSetCursor?.(args.blockNumber);
      return null;
    }
  );
  const upsertPack = vi.fn(async () => {
    if (overrides?.onUpsertPack) await overrides.onUpsertPack();
    return null;
  });

  return {
    runQuery: vi.fn(async () => overrides?.cursor ?? null),
    runMutation: vi.fn(async (_ref: unknown, args: unknown) => {
      // Dispatch by args shape — FunctionReferences aren't stringifiable in vitest.
      if (
        args &&
        typeof args === "object" &&
        "blockNumber" in args &&
        "key" in args
      ) {
        return setCursor(_ref, args as { key: string; blockNumber: number });
      }
      if (
        args &&
        typeof args === "object" &&
        "tokenId" in args &&
        "status" in args
      ) {
        return upsertPack();
      }
      return null;
    }),
  } as unknown as ActionCtx;
}

function makeClient(overrides?: {
  logs?: Log[];
  getLogs?: () => Promise<Log[]>;
  readContract?: (args: { functionName: string }) => Promise<unknown>;
}): PublicClient {
  return {
    getLogs: overrides?.getLogs ?? (async () => overrides?.logs ?? []),
    readContract:
      overrides?.readContract ??
      (async () => {
        throw new Error("unexpected readContract");
      }),
  } as unknown as PublicClient;
}

function packEnteredLog(tokenId: bigint, maker: `0x${string}`): Log {
  const topics = encodeEventTopics({
    abi: ripEngineAbi,
    eventName: "PackEntered",
    args: { tokenId, maker },
  });
  return {
    address: RIP,
    blockHash: "0x" + "11".repeat(32),
    blockNumber: 100n,
    data: "0x",
    logIndex: 0,
    transactionHash: "0x" + "22".repeat(32),
    transactionIndex: 0,
    removed: false,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
  };
}

describe("isContractCallRevert", () => {
  it("detects nested ContractFunctionRevertedError", () => {
    const reverted = new ContractFunctionRevertedError({
      abi: ripEngineAbi,
      functionName: "navOfPack",
      args: [1n],
      data: "0x",
    } as ConstructorParameters<typeof ContractFunctionRevertedError>[0]);
    const wrapped = new BaseError("execution reverted", { cause: reverted });
    expect(isContractCallRevert(wrapped)).toBe(true);
  });

  it("does not treat transport errors as reverts", () => {
    const http = new HttpRequestError({
      url: "https://example.invalid",
      body: {},
      details: "timeout",
    });
    expect(isContractCallRevert(http)).toBe(false);
    expect(isContractCallRevert(new Error("RPC down"))).toBe(false);
  });
});

describe("readNavOfPack", () => {
  it("returns null on contract revert", async () => {
    const reverted = new ContractFunctionRevertedError({
      abi: ripEngineAbi,
      functionName: "navOfPack",
      args: [1n],
      data: "0x",
    } as ConstructorParameters<typeof ContractFunctionRevertedError>[0]);
    const client = makeClient({
      readContract: async () => {
        throw new BaseError("reverted", { cause: reverted });
      },
    });
    await expect(readNavOfPack(client, RIP, 1n)).resolves.toBeNull();
  });

  it("propagates RPC / transport failures", async () => {
    const client = makeClient({
      readContract: async () => {
        throw new HttpRequestError({
          url: "https://example.invalid",
          body: {},
          details: "ECONNRESET",
        });
      },
    });
    await expect(readNavOfPack(client, RIP, 1n)).rejects.toBeInstanceOf(
      HttpRequestError
    );
  });

  it("returns NAV string on success", async () => {
    const client = makeClient({
      readContract: async () => 42n * 10n ** 18n,
    });
    await expect(readNavOfPack(client, RIP, 1n)).resolves.toBe(
      (42n * 10n ** 18n).toString()
    );
  });
});

describe("scanLogs cursor advancement", () => {
  it("does not advance the cursor when apply fails mid-chunk", async () => {
    const setCursorBlocks: number[] = [];
    const ctx = makeCtx({
      cursor: 10,
      onSetCursor: (n) => setCursorBlocks.push(n),
    });
    const logs = [packEnteredLog(1n, ZERO_ADDR), packEnteredLog(2n, ZERO_ADDR)];
    const client = makeClient({ logs });

    let calls = 0;
    await expect(
      scanLogs(ctx, client, {
        key: "ripEngine",
        address: RIP,
        events: [],
        fallbackBlock: 1n,
        latest: 10n + MAX_BLOCK_SPAN - 1n,
        apply: async () => {
          calls += 1;
          if (calls === 2) throw new Error("mutation failed");
        },
      })
    ).rejects.toThrow("mutation failed");

    expect(calls).toBe(2);
    expect(setCursorBlocks).toEqual([]);
  });

  it("advances the cursor only after a chunk fully succeeds", async () => {
    const setCursorBlocks: number[] = [];
    const ctx = makeCtx({
      cursor: 100,
      onSetCursor: (n) => setCursorBlocks.push(n),
    });
    const client = makeClient({
      logs: [packEnteredLog(1n, ZERO_ADDR)],
    });

    await scanLogs(ctx, client, {
      key: "ripEngine",
      address: RIP,
      events: [],
      fallbackBlock: 1n,
      latest: 150n,
      apply: async () => undefined,
    });

    expect(setCursorBlocks).toEqual([150]);
  });
});

describe("applyRipEngineLog error boundary", () => {
  it("skips undecodable logs without throwing", async () => {
    const ctx = makeCtx();
    const client = makeClient();
    const junk: Log = {
      address: RIP,
      blockHash: "0x" + "11".repeat(32),
      blockNumber: 1n,
      data: "0xdeadbeef",
      logIndex: 0,
      transactionHash: "0x" + "22".repeat(32),
      transactionIndex: 0,
      removed: false,
      topics: ["0x" + "33".repeat(32)],
    };
    await expect(
      applyRipEngineLog(
        ctx,
        client,
        { packCustody: PACK, ripEngine: RIP },
        junk,
        Date.now()
      )
    ).resolves.toBeUndefined();
  });

  it("propagates mutation failures after a successful decode", async () => {
    const ctx = makeCtx({
      onUpsertPack: async () => {
        throw new Error("db write failed");
      },
    });
    const client = makeClient({
      readContract: async ({ functionName }) => {
        if (functionName === "basketOf") {
          return [{ asset: ZERO_ADDR, amount: 1n }];
        }
        if (functionName === "navOfPack") {
          return 100n * 10n ** 18n;
        }
        throw new Error(`unexpected ${functionName}`);
      },
    });

    await expect(
      applyRipEngineLog(
        ctx,
        client,
        { packCustody: PACK, ripEngine: RIP },
        packEnteredLog(7n, ZERO_ADDR),
        Date.now()
      )
    ).rejects.toThrow("db write failed");
  });
});

describe("tryDecodeEventLog", () => {
  it("decodes PackEntered", () => {
    const log = packEnteredLog(9n, ZERO_ADDR);
    const decoded = tryDecodeEventLog(ripEngineAbi, log);
    expect(decoded?.eventName).toBe("PackEntered");
    if (decoded?.eventName === "PackEntered") {
      expect(decoded.args.tokenId).toBe(9n);
    }
  });
});
