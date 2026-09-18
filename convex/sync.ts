import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  BASE_CHAIN_ID,
  CONFIRMATION_BUFFER_BLOCKS,
  MARGIN_CALL_ADDRESS,
  MARGIN_CALL_DEPLOYED_AT_BLOCK,
  RECONCILE_BLOCK_BATCH,
  RECONCILE_OVERLAP_BLOCKS,
} from "./lib/deployment";
import { RELEVANT_EVENT_TOPICS, type WireLog } from "./lib/events";
import {
  ethBlockNumber,
  ethChainId,
  ethGetLogs,
  ethGetTransactionReceipt,
  hexToNumber,
  type JsonRpcFetch,
  type RpcLog,
} from "./lib/rpc";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

function rpcLogToWire(log: RpcLog): WireLog | null {
  if (log.removed) return null;
  if (!log.blockNumber || !log.transactionHash || log.logIndex === null) {
    return null;
  }
  return {
    address: log.address.toLowerCase(),
    topics: [...log.topics],
    data: log.data,
    blockNumber: hexToNumber(log.blockNumber),
    transactionHash: log.transactionHash.toLowerCase(),
    logIndex: hexToNumber(log.logIndex),
  };
}

type SyncResult = {
  ok: boolean;
  applied: number;
  reason?: string;
};

/**
 * After a Base tx confirms, the app passes only the hash.
 * Convex fetches and verifies the receipt before mutating the read model.
 */
export const syncTransaction = action({
  args: {
    txHash: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    applied: v.number(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SyncResult> => {
    const txHash = args.txHash.trim();
    if (!TX_HASH_RE.test(txHash)) {
      return { ok: false, applied: 0, reason: "invalid_tx_hash" };
    }

    const chainId = await ethChainId();
    if (chainId !== BASE_CHAIN_ID) {
      return { ok: false, applied: 0, reason: "wrong_chain" };
    }

    const receipt = await ethGetTransactionReceipt(txHash);
    if (!receipt) {
      return { ok: false, applied: 0, reason: "receipt_not_found" };
    }
    if (receipt.status !== "0x1") {
      return { ok: false, applied: 0, reason: "receipt_failed" };
    }

    const logs: WireLog[] = [];
    for (const raw of receipt.logs) {
      if (raw.address.toLowerCase() !== MARGIN_CALL_ADDRESS) {
        continue;
      }
      const wire = rpcLogToWire(raw);
      if (wire) {
        logs.push(wire);
      }
    }

    if (logs.length === 0) {
      return { ok: true, applied: 0, reason: "no_relevant_logs" };
    }

    const result: { applied: number } = await ctx.runMutation(
      internal.ingest.applyVerifiedLogs,
      { logs }
    );
    return { ok: true, applied: result.applied };
  },
});

type ReconcileResult = {
  fromBlock: number;
  toBlock: number;
  applied: number;
  caughtUp: boolean;
};

/**
 * Low-frequency reconciliation: scan MarginCall logs since the cursor.
 * Exported for tests that inject a custom fetch.
 */
export async function runReconcile(
  ctx: ActionCtx,
  fetchImpl: JsonRpcFetch = fetch
): Promise<ReconcileResult> {
  const chainId = await ethChainId(fetchImpl);
  if (chainId !== BASE_CHAIN_ID) {
    throw new Error(
      `Base RPC chainId ${chainId} !== expected ${BASE_CHAIN_ID}`
    );
  }

  const cursor = await ctx.runQuery(internal.ingest.getSyncCursor, {});

  const latest = await ethBlockNumber(fetchImpl);
  const safeHead = Math.max(0, latest - CONFIRMATION_BUFFER_BLOCKS);

  let fromBlock: number;
  if (cursor === null) {
    fromBlock = MARGIN_CALL_DEPLOYED_AT_BLOCK;
  } else {
    fromBlock = Math.max(
      MARGIN_CALL_DEPLOYED_AT_BLOCK,
      cursor.cursorBlock - RECONCILE_OVERLAP_BLOCKS + 1
    );
  }

  if (fromBlock > safeHead) {
    await ctx.runMutation(internal.ingest.setSyncCursor, {
      cursorBlock: cursor?.cursorBlock ?? safeHead,
      lastRunAt: Date.now(),
    });
    return {
      fromBlock,
      toBlock: safeHead,
      applied: 0,
      caughtUp: true,
    };
  }

  const toBlock = Math.min(safeHead, fromBlock + RECONCILE_BLOCK_BATCH - 1);

  const rpcLogs = await ethGetLogs(
    {
      address: MARGIN_CALL_ADDRESS,
      topics: [[...RELEVANT_EVENT_TOPICS]],
      fromBlock,
      toBlock,
    },
    fetchImpl
  );

  const logs: WireLog[] = [];
  for (const raw of rpcLogs) {
    const wire = rpcLogToWire(raw);
    if (wire) {
      logs.push(wire);
    }
  }

  const result: { applied: number } = await ctx.runMutation(
    internal.ingest.applyVerifiedLogs,
    { logs }
  );

  await ctx.runMutation(internal.ingest.setSyncCursor, {
    cursorBlock: toBlock,
    lastRunAt: Date.now(),
  });

  const caughtUp = toBlock >= safeHead;
  if (!caughtUp) {
    await ctx.scheduler.runAfter(0, internal.sync.reconcile, {});
  }

  return {
    fromBlock,
    toBlock,
    applied: result.applied,
    caughtUp,
  };
}

export const reconcile = internalAction({
  args: {},
  returns: v.object({
    fromBlock: v.number(),
    toBlock: v.number(),
    applied: v.number(),
    caughtUp: v.boolean(),
  }),
  handler: async (ctx): Promise<ReconcileResult> => {
    return await runReconcile(ctx);
  },
});
