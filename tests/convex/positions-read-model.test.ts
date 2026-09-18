/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  MARGIN_CALL_ADDRESS,
  MARGIN_CALL_DEPLOYED_AT_BLOCK,
} from "../../convex/lib/deployment";
import {
  encodeTestLog,
  positionClosedEvent,
  positionLiquidatedEvent,
  positionOpenedEvent,
  transferEvent,
  type VerifiedLog,
} from "../../convex/lib/events";
import { runReconcile } from "../../convex/sync";

const modules = import.meta.glob("../../convex/**/*.ts");

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";
const TX_OPEN =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const TX_TRANSFER =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
const TX_CLOSE =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex;
const TX_LIQ =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as Hex;

function openLogs(
  tokenId: bigint,
  owner: string,
  assetId: bigint
): VerifiedLog[] {
  return [
    encodeTestLog({
      event: positionOpenedEvent,
      args: {
        tokenId,
        owner,
        assetId,
        stockAmount: 1_000_000n,
      },
      blockNumber: 51_470_700,
      transactionHash: TX_OPEN,
      logIndex: 0,
      blockTimestamp: 1_700_000_000,
    }),
    encodeTestLog({
      event: transferEvent,
      args: { from: ZERO, to: owner, tokenId },
      blockNumber: 51_470_700,
      transactionHash: TX_OPEN,
      logIndex: 1,
    }),
  ];
}

describe("Convex Position read model", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a position from verified PositionOpened and ignores mint Transfer", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(1n, OWNER_A, 1n),
    });

    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "1",
    });
    expect(row).not.toBeNull();
    expect(row!.tokenId).toBe("1");
    expect(row!.owner).toBe(OWNER_A.toLowerCase());
    expect(row!.assetId).toBe(1);
    expect(row!.status).toBe("active");
    expect(row!.openedTxHash).toBe(TX_OPEN);
    expect(row!.openedAt).toBe(1_700_000_000);
    // No financial fields on the document.
    expect(row).not.toHaveProperty("currentDebt");
    expect(row).not.toHaveProperty("nav");
    expect(row).not.toHaveProperty("stockAmount");

    const owned = await t.query(api.positions.positionsByOwner, {
      owner: OWNER_A,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(owned.page).toHaveLength(1);
    expect(owned.page[0]!.tokenId).toBe("1");
  });

  it("ignores logs from a non-canonical address", async () => {
    const t = convexTest(schema, modules);
    const spoof = encodeTestLog({
      event: positionOpenedEvent,
      args: {
        tokenId: 99n,
        owner: OWNER_A,
        assetId: 1n,
        stockAmount: 1n,
      },
      blockNumber: 1,
      transactionHash: TX_OPEN,
      logIndex: 0,
      address: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    });
    await t.mutation(internal.ingest.applyVerifiedLogs, { logs: [spoof] });
    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "99",
    });
    expect(row).toBeNull();
  });

  it("updates owner on real Transfer and removes from previous owner query", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(2n, OWNER_A, 2n),
    });
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: [
        encodeTestLog({
          event: transferEvent,
          args: { from: OWNER_A, to: OWNER_B, tokenId: 2n },
          blockNumber: 51_470_800,
          transactionHash: TX_TRANSFER,
          logIndex: 0,
        }),
      ],
    });

    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "2",
    });
    expect(row!.owner).toBe(OWNER_B.toLowerCase());
    expect(row!.status).toBe("active");

    const prev = await t.query(api.positions.positionsByOwner, {
      owner: OWNER_A,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(prev.page).toHaveLength(0);

    const next = await t.query(api.positions.positionsByOwner, {
      owner: OWNER_B,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(next.page).toHaveLength(1);
  });

  it("marks closed / liquidated from terminal events; burn Transfer does not zero owner", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(3n, OWNER_A, 1n),
    });

    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: [
        encodeTestLog({
          event: transferEvent,
          args: { from: OWNER_A, to: ZERO, tokenId: 3n },
          blockNumber: 51_470_900,
          transactionHash: TX_CLOSE,
          logIndex: 0,
        }),
        encodeTestLog({
          event: positionClosedEvent,
          args: { tokenId: 3n, owner: OWNER_A, stockAmount: 1n },
          blockNumber: 51_470_900,
          transactionHash: TX_CLOSE,
          logIndex: 1,
        }),
      ],
    });

    const closed = await t.query(api.positions.positionByTokenId, {
      tokenId: "3",
    });
    expect(closed!.status).toBe("closed");
    expect(closed!.owner).toBe(OWNER_A.toLowerCase());
    expect(closed!.terminalTxHash).toBe(TX_CLOSE);

    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(4n, OWNER_A, 3n),
    });
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: [
        encodeTestLog({
          event: transferEvent,
          args: { from: OWNER_A, to: ZERO, tokenId: 4n },
          blockNumber: 51_471_000,
          transactionHash: TX_LIQ,
          logIndex: 0,
        }),
        encodeTestLog({
          event: positionLiquidatedEvent,
          args: {
            tokenId: 4n,
            owner: OWNER_A,
            stockAmount: 1n,
            usdcOut: 100n,
          },
          blockNumber: 51_471_000,
          transactionHash: TX_LIQ,
          logIndex: 1,
        }),
      ],
    });
    const liq = await t.query(api.positions.positionByTokenId, {
      tokenId: "4",
    });
    expect(liq!.status).toBe("liquidated");
    expect(liq!.owner).toBe(OWNER_A.toLowerCase());
  });

  it("replaying the same logs is idempotent", async () => {
    const t = convexTest(schema, modules);
    const logs = openLogs(5n, OWNER_A, 1n);
    await t.mutation(internal.ingest.applyVerifiedLogs, { logs });
    await t.mutation(internal.ingest.applyVerifiedLogs, { logs });

    const all = await t.query(api.positions.allPositions, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    const matches = all.page.filter((p) => p.tokenId === "5");
    expect(matches).toHaveLength(1);
  });

  it("does not reopen a closed position on replayed Opened", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(6n, OWNER_A, 1n),
    });
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: [
        encodeTestLog({
          event: positionClosedEvent,
          args: { tokenId: 6n, owner: OWNER_A, stockAmount: 1n },
          blockNumber: 51_471_100,
          transactionHash: TX_CLOSE,
          logIndex: 0,
        }),
      ],
    });
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: openLogs(6n, OWNER_A, 1n),
    });
    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "6",
    });
    expect(row!.status).toBe("closed");
  });

  it("paginates and filters allPositions / positionsByOwner deterministically", async () => {
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 3; i++) {
      await t.mutation(internal.ingest.applyVerifiedLogs, {
        logs: [
          encodeTestLog({
            event: positionOpenedEvent,
            args: {
              tokenId: BigInt(100 + i),
              owner: OWNER_A,
              assetId: BigInt(i === 2 ? 2 : 1),
              stockAmount: 1n,
            },
            blockNumber: 51_472_000 + i,
            transactionHash: `0x${i.toString(16).padStart(64, "e")}` as Hex,
            logIndex: 0,
          }),
        ],
      });
    }
    await t.mutation(internal.ingest.applyVerifiedLogs, {
      logs: [
        encodeTestLog({
          event: positionClosedEvent,
          args: { tokenId: 101n, owner: OWNER_A, stockAmount: 1n },
          blockNumber: 51_472_010,
          transactionHash: TX_CLOSE,
          logIndex: 0,
        }),
      ],
    });

    const active = await t.query(api.positions.allPositions, {
      status: "active",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(active.page.every((p) => p.status === "active")).toBe(true);
    expect(active.page.length).toBeGreaterThanOrEqual(2);

    const asset2 = await t.query(api.positions.allPositions, {
      status: "active",
      assetId: 2,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(asset2.page).toHaveLength(1);
    expect(asset2.page[0]!.tokenId).toBe("102");

    const page1 = await t.query(api.positions.allPositions, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.page).toHaveLength(2);
    expect(page1.isDone).toBe(false);
    const page2 = await t.query(api.positions.allPositions, {
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.length).toBeGreaterThanOrEqual(1);
  });

  it("starts reconcile from deployment block when cursor is missing", async () => {
    const t = convexTest(schema, modules);
    const openLog = openLogs(7n, OWNER_A, 1n)[0]!;

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      if (body.method === "eth_blockNumber") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: `0x${(MARGIN_CALL_DEPLOYED_AT_BLOCK + 20).toString(16)}`,
          }),
          { status: 200 }
        );
      }
      if (body.method === "eth_getLogs") {
        const filter = body.params[0] as { fromBlock: string; toBlock: string };
        const from = Number(BigInt(filter.fromBlock));
        expect(from).toBe(MARGIN_CALL_DEPLOYED_AT_BLOCK);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: [
              {
                address: MARGIN_CALL_ADDRESS,
                topics: openLog.topics,
                data: openLog.data,
                blockNumber: `0x${openLog.blockNumber.toString(16)}`,
                transactionHash: openLog.transactionHash,
                logIndex: `0x${openLog.logIndex.toString(16)}`,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected RPC ${body.method}`);
    });

    await t.run(async (ctx) => {
      const actionCtx = {
        runQuery: ctx.runQuery.bind(ctx),
        runMutation: ctx.runMutation.bind(ctx),
        scheduler: {
          runAfter: async () => null,
        },
      };
      const result = await runReconcile(
        actionCtx as Parameters<typeof runReconcile>[0],
        fetchImpl as typeof fetch
      );
      expect(result.fromBlock).toBe(MARGIN_CALL_DEPLOYED_AT_BLOCK);
      expect(result.applied).toBeGreaterThanOrEqual(1);
    });

    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "7",
    });
    expect(row).not.toBeNull();
    expect(row!.status).toBe("active");

    const cursor = await t.query(internal.ingest.getSyncCursor, {});
    expect(cursor).not.toBeNull();
    expect(cursor!.cursorBlock).toBeGreaterThanOrEqual(
      MARGIN_CALL_DEPLOYED_AT_BLOCK
    );
  });

  it("syncTransaction verifies receipt via RPC and applies logs", async () => {
    const t = convexTest(schema, modules);
    const logs = openLogs(8n, OWNER_A, 1n);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          method: string;
          params: string[];
        };
        if (body.method === "eth_getTransactionReceipt") {
          expect(body.params[0]).toBe(TX_OPEN);
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: {
                status: "0x1",
                blockNumber: `0x${logs[0]!.blockNumber.toString(16)}`,
                transactionHash: TX_OPEN,
                logs: logs.map((l) => ({
                  address: l.address,
                  topics: l.topics,
                  data: l.data,
                  blockNumber: `0x${l.blockNumber.toString(16)}`,
                  transactionHash: l.transactionHash,
                  logIndex: `0x${l.logIndex.toString(16)}`,
                })),
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`unexpected ${body.method}`);
      })
    );

    const result = await t.action(api.sync.syncTransaction, {
      txHash: TX_OPEN,
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toBeGreaterThanOrEqual(1);

    const row = await t.query(api.positions.positionByTokenId, {
      tokenId: "8",
    });
    expect(row!.owner).toBe(OWNER_A.toLowerCase());
  });

  it("syncTransaction rejects failed receipts and does not create rows", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              status: "0x0",
              blockNumber: "0x1",
              transactionHash: TX_OPEN,
              logs: [],
            },
          }),
          { status: 200 }
        );
      })
    );

    const result = await t.action(api.sync.syncTransaction, {
      txHash: TX_OPEN,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("receipt_failed");

    const all = await t.query(api.positions.allPositions, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(all.page).toHaveLength(0);
  });

  it("syncTransaction rejects invalid hash without trusting client state", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(api.sync.syncTransaction, {
      txHash: "not-a-hash",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_tx_hash");
  });
});
