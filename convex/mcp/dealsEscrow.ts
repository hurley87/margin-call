"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { parseAmountUsdc } from "./traders";
import type { McpDealWriteResult } from "./deals";
import { assertTradingHours } from "../lib/tradingHours";
import { assertPerActionCap } from "./limits";
import {
  simulateUsdcApprove,
  simulateEscrowCreateDeal,
  simulateEscrowCloseDeal,
} from "./simulate";
import {
  ESCROW_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  USDC_DECIMALS,
  MCP_CHAIN,
  DEAL_STATUS_CLOSED,
  LARGE_APPROVE_ALLOWANCE,
  erc20Abi,
  escrowAbi,
  serializeCall,
  type PreparedCall,
} from "./escrowConstants";
import {
  requireDeskWallet,
  verifyTxSucceeded,
  getBaseSepoliaPublicClient,
} from "./deskByo";
import { shapePrepareResult } from "./intents";

type PrepareActionResult = Record<string, unknown>;

export const createPrepareForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    // A deal is always created against a newswire post (wire deal seed).
    wireDealSeedId: v.id("wireDealSeeds"),
    // Optional overrides; default to the post's suggested values.
    prompt: v.optional(v.string()),
    potUsdc: v.optional(v.number()),
    entryCostUsdc: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareActionResult> => {
    assertTradingHours();

    // Load the newswire post and derive deal fields (override → suggestion).
    const seed = await ctx.runQuery(internal.mcp.newswire.getSeed, {
      seedId: args.wireDealSeedId,
    });
    const prompt =
      typeof args.prompt === "string" && args.prompt.trim() !== ""
        ? args.prompt.trim()
        : seed.prompt;
    const potUsdc = args.potUsdc ?? seed.suggestedPotUsdc;
    const entryCostUsdc = args.entryCostUsdc ?? seed.suggestedEntryCostUsdc;
    const sourceHeadline = seed.dispatchHeadline;

    if (typeof prompt !== "string" || prompt.trim() === "") {
      throw new Error("prompt is required");
    }

    await assertPerActionCap(ctx, args.deskManagerId, "create_deal", potUsdc);

    const potAtomic = parseAmountUsdc(potUsdc);
    const entryCostAtomic = parseAmountUsdc(entryCostUsdc);
    if (entryCostAtomic > potAtomic) {
      throw new Error("entryCostUsdc must be <= potUsdc");
    }

    const now = Date.now();
    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject) throw new Error("Desk not found");
    const deskAddress = requireDeskWallet(dm);
    if ((dm.walletBalanceUsdc ?? 0) < potUsdc) {
      throw new Error(
        "Insufficient desk wallet balance — sync_wallet after funding your Base Account"
      );
    }

    const { encodeFunctionData } = await import("viem");
    const publicClient = await getBaseSepoliaPublicClient();

    const calls: PreparedCall[] = [];

    const currentAllowance = (await publicClient.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deskAddress, ESCROW_ADDRESS],
    })) as bigint;

    const needsApprove = currentAllowance < potAtomic;
    if (needsApprove) {
      await simulateUsdcApprove(
        publicClient,
        USDC_SEPOLIA_ADDRESS,
        deskAddress,
        ESCROW_ADDRESS,
        LARGE_APPROVE_ALLOWANCE
      );
      calls.push({
        to: USDC_SEPOLIA_ADDRESS,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, LARGE_APPROVE_ALLOWANCE],
        }),
      });
    }

    // createDeal performs usdc.safeTransferFrom(deskAddress, escrow, pot), which
    // requires allowance >= pot. When we batch a fresh approve above, that
    // approve has NOT executed on-chain yet, so simulating createDeal against
    // current state would always revert with "insufficient allowance". The Base
    // MCP send_calls batch runs approve→createDeal atomically and confirm_intent
    // verifies the tx succeeded, so only pre-simulate when allowance already
    // exists.
    if (!needsApprove) {
      await simulateEscrowCreateDeal(
        publicClient,
        ESCROW_ADDRESS,
        deskAddress,
        prompt,
        potAtomic,
        entryCostAtomic
      );
    }

    calls.push({
      to: ESCROW_ADDRESS,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: escrowAbi,
        functionName: "createDeal",
        args: [prompt, potAtomic, entryCostAtomic],
      }),
    });

    const intent = await ctx.runMutation(internal.mcp.intents.create, {
      deskManagerId: args.deskManagerId,
      intentType: "create_deal",
      chain: MCP_CHAIN,
      calls: calls.map(serializeCall),
      payload: {
        prompt,
        potUsdc,
        entryCostUsdc,
        walletAddress: deskAddress,
        wireDealSeedId: args.wireDealSeedId,
        sourceHeadline,
      },
      idempotencyKey: args.idempotencyKey,
      now,
    });

    return shapePrepareResult(
      intent,
      `Prepared create_deal against "${sourceHeadline}": ${potUsdc.toFixed(2)} USDC pot, ${entryCostUsdc.toFixed(2)} USDC entry (${calls.length} call(s)).`
    );
  },
});

export const createConfirmForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    intentId: v.id("mcpIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args): Promise<McpDealWriteResult> => {
    // No trading-hours gate here: the on-chain tx has already executed by
    // confirm time, so refusing to record it would orphan a real deal.
    const now = Date.now();

    const loaded = await ctx.runQuery(internal.mcp.intents.getForConfirm, {
      intentId: args.intentId,
      deskManagerId: args.deskManagerId,
      now,
    });

    if (loaded.alreadyConfirmed && loaded.intent.confirmResult) {
      return loaded.intent.confirmResult as McpDealWriteResult;
    }

    const intent = loaded.intent;
    if (intent.intentType !== "create_deal") {
      throw new Error("Intent type mismatch");
    }

    const payload = intent.payload as {
      prompt: string;
      potUsdc: number;
      entryCostUsdc: number;
      walletAddress: string;
      wireDealSeedId?: Id<"wireDealSeeds">;
      sourceHeadline?: string;
    };

    const { receipt } = await verifyTxSucceeded(args.txHash);

    const { decodeEventLog } = await import("viem");

    // Bind the tx to this intent: only accept a DealCreated event emitted by
    // our escrow contract, and require the on-chain creator to be the desk
    // wallet so a desk cannot confirm with an unrelated/forged tx. The event
    // also carries prompt/pot/entryCost so we record what the chain actually
    // escrowed without a follow-up getDeal read.
    const expectedCreator = payload.walletAddress.toLowerCase();
    let dealEvent:
      | {
          dealId: bigint;
          creator: string;
          prompt: string;
          pot: bigint;
          entryCost: bigint;
        }
      | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
        continue;
      }
      try {
        const decoded = decodeEventLog({
          abi: escrowAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "DealCreated") {
          dealEvent = decoded.args as typeof dealEvent;
          break;
        }
      } catch {
        // not our event
      }
    }
    if (!dealEvent) {
      throw new Error(
        "createDeal succeeded but no DealCreated event from the escrow contract was found — txHash does not match this intent"
      );
    }
    if (dealEvent.creator.toLowerCase() !== expectedCreator) {
      throw new Error(
        "DealCreated creator does not match the desk wallet for this intent"
      );
    }

    const onChainDealId = Number(dealEvent.dealId);

    const recorded: McpDealWriteResult = await ctx.runMutation(
      internal.mcp.deals.recordOnChainCreationForMcp,
      {
        deskManagerId: args.deskManagerId,
        onChainDealId,
        onChainTxHash: args.txHash,
        prompt: dealEvent.prompt,
        potUsdc: Number(dealEvent.pot) / USDC_DECIMALS,
        entryCostUsdc: Number(dealEvent.entryCost) / USDC_DECIMALS,
        sourceHeadline: payload.sourceHeadline,
        wireDealSeedId: payload.wireDealSeedId,
      }
    );

    await ctx.runMutation(internal.mcp.intents.markConfirmed, {
      intentId: args.intentId,
      txHash: args.txHash,
      confirmResult: recorded,
      now,
    });

    return recorded;
  },
});

export const closePrepareForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    dealId: v.id("deals"),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareActionResult> => {
    assertTradingHours();
    const now = Date.now();

    const loaded = await ctx.runQuery(
      internal.mcp.deals.loadOwnedDealForClose,
      {
        deskManagerId: args.deskManagerId,
        dealId: args.dealId,
      }
    );

    if (!loaded.walletAddress) {
      throw new Error("Desk wallet not bound — call set_desk_wallet first");
    }
    const deskAddress = requireDeskWallet({
      walletAddress: loaded.walletAddress,
    });

    const { encodeFunctionData } = await import("viem");
    const publicClient = await getBaseSepoliaPublicClient();

    // Chain `pendingEntries` can lag the Convex view, so check it on-chain
    // before queueing the intent.
    const onChainDeal = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getDeal",
      args: [BigInt(loaded.onChainDealId)],
    });
    const pendingEntries = onChainDeal.pendingEntries;

    if (pendingEntries > BigInt(0)) {
      throw new Error(
        `Cannot close deal: ${pendingEntries.toString()} pending entr${pendingEntries === BigInt(1) ? "y" : "ies"} on-chain. Wait for the agent cycle to resolve them.`
      );
    }

    await simulateEscrowCloseDeal(
      publicClient,
      ESCROW_ADDRESS,
      deskAddress,
      BigInt(loaded.onChainDealId)
    );

    const closeCalls: PreparedCall[] = [
      {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: escrowAbi,
          functionName: "closeDeal",
          args: [BigInt(loaded.onChainDealId)] as const,
        }),
      },
    ];

    const intent = await ctx.runMutation(internal.mcp.intents.create, {
      deskManagerId: args.deskManagerId,
      intentType: "close_deal",
      chain: MCP_CHAIN,
      calls: closeCalls.map(serializeCall),
      payload: {
        dealId: args.dealId,
        onChainDealId: loaded.onChainDealId,
        walletAddress: loaded.walletAddress,
      },
      idempotencyKey: args.idempotencyKey,
      now,
    });

    return shapePrepareResult(
      intent,
      `Prepared close for on-chain deal #${loaded.onChainDealId}.`
    );
  },
});

export const closeConfirmForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    intentId: v.id("mcpIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args): Promise<McpDealWriteResult> => {
    // No trading-hours gate: the on-chain close has already executed, so this
    // is pure state reconciliation that must not be time-gated.
    const now = Date.now();

    const loaded = await ctx.runQuery(internal.mcp.intents.getForConfirm, {
      intentId: args.intentId,
      deskManagerId: args.deskManagerId,
      now,
    });

    if (loaded.alreadyConfirmed && loaded.intent.confirmResult) {
      return loaded.intent.confirmResult as McpDealWriteResult;
    }

    const intent = loaded.intent;
    if (intent.intentType !== "close_deal") {
      throw new Error("Intent type mismatch");
    }

    const payload = intent.payload as {
      dealId: Id<"deals">;
      onChainDealId: number;
      walletAddress: string;
    };

    // Verify the tx mined without reverting, then bind it to this intent by
    // re-reading the escrow's deal status. verifyTxSucceeded alone only proves
    // *some* tx succeeded; a desk could otherwise confirm with any unrelated
    // successful txHash and mark the deal closed in Convex while it stays open
    // on-chain (pot not returned, entries can still settle). Asserting the
    // on-chain deal is Closed mirrors the create path's event-binding guarantee.
    const { publicClient } = await verifyTxSucceeded(args.txHash);
    const onChainDeal = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getDeal",
      args: [BigInt(payload.onChainDealId)],
    });
    if (onChainDeal.status !== DEAL_STATUS_CLOSED) {
      throw new Error(
        `On-chain deal #${payload.onChainDealId} is not closed (status ${onChainDeal.status}) — txHash does not match this close intent`
      );
    }

    await ctx.runMutation(internal.mcp.deals.markDealClosedForMcp, {
      deskManagerId: args.deskManagerId,
      dealId: payload.dealId,
    });

    const result: McpDealWriteResult = {
      dealId: String(payload.dealId),
      onChainDealId: payload.onChainDealId,
      txHash: args.txHash,
      walletAddress: payload.walletAddress,
      summary: `Closed deal #${payload.onChainDealId}. Remaining pot returned to your Base Account — call sync_wallet.`,
    };

    await ctx.runMutation(internal.mcp.intents.markConfirmed, {
      intentId: args.intentId,
      txHash: args.txHash,
      confirmResult: result,
      now,
    });

    return result;
  },
});
