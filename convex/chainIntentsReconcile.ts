"use node";

/**
 * Reconcile stuck chain intents by looking up transaction identity (#249).
 * Never re-signs or resubmits.
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  decideReconcile,
  decisionToStatus,
} from "./lib/chainIntents/reconcile";
import type { ReceiptLike } from "./lib/chainIntents/confirm";
import { getViemChain, requireRpcUrl } from "./lib/networks";
import type { ChainIntentStatus } from "./lib/chainIntents/stateMachine";

const STUCK_AFTER_MS = 60_000;
const MAX_PER_TICK = 25;

async function lookupReceipt(
  networkSlug: string,
  txHash: string
): Promise<ReceiptLike | null> {
  const { createPublicClient, http } = await import("viem");
  const client = createPublicClient({
    chain: getViemChain(networkSlug),
    transport: http(requireRpcUrl(networkSlug)),
  });
  try {
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      transactionHash: receipt.transactionHash,
    };
  } catch {
    return null;
  }
}

export const reconcileStuck = internalAction({
  args: {
    now: v.optional(v.number()),
    olderThanMs: v.optional(v.number()),
  },
  returns: v.object({
    examined: v.number(),
    confirmed: v.number(),
    failed: v.number(),
    abandoned: v.number(),
    stillReconciling: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const olderThanMs = args.olderThanMs ?? STUCK_AFTER_MS;

    const stuck = await ctx.runQuery(internal.chainIntents.listStuck, {
      olderThanMs,
      now,
      limit: MAX_PER_TICK,
    });

    let confirmed = 0;
    let failed = 0;
    let abandoned = 0;
    let stillReconciling = 0;

    for (const intent of stuck) {
      const status = intent.status as ChainIntentStatus;
      // Move submitted → reconciling before looking up (never resubmit).
      if (status === "submitted") {
        await ctx.runMutation(internal.chainIntents.transition, {
          intentId: intent._id,
          to: "reconciling",
          now,
          txHash: intent.txHash,
        });
      }

      const receiptByHash = intent.txHash
        ? await lookupReceipt(intent.networkSlug, intent.txHash)
        : null;

      const decision = decideReconcile({
        status: "reconciling",
        txHash: intent.txHash,
        receiptByHash,
        reconcileAttempts: intent.attempts ?? 0,
      });

      const to = decisionToStatus(decision);
      await ctx.runMutation(internal.chainIntents.transition, {
        intentId: intent._id,
        to,
        now,
        txHash:
          decision.action === "confirm" || decision.action === "fail"
            ? decision.txHash
            : intent.txHash,
        lastError:
          decision.action === "fail" ||
          decision.action === "abandon" ||
          decision.action === "stay_reconciling"
            ? decision.reason
            : undefined,
        confirmResult:
          decision.action === "confirm"
            ? {
                reconciled: true,
                blockNumber: String(decision.outcome.blockNumber),
              }
            : undefined,
      });

      switch (decision.action) {
        case "confirm":
          confirmed += 1;
          break;
        case "fail":
          failed += 1;
          break;
        case "abandon":
          abandoned += 1;
          break;
        case "stay_reconciling":
          stillReconciling += 1;
          break;
        default: {
          const _exhaustive: never = decision;
          void _exhaustive;
        }
      }
    }

    return {
      examined: stuck.length,
      confirmed,
      failed,
      abandoned,
      stillReconciling,
    };
  },
});
