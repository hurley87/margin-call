"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { parseAmountUsdc, type McpTraderWriteResult } from "./traders";
import { assertTraderOwnedByDesk } from "../traders";
import { assertPerActionCap, usdcApproveAllowance } from "./limits";
import {
  simulateUsdcApprove,
  simulateEscrowDepositFor,
  simulateEscrowTraderWithdraw,
} from "./simulate";
import {
  ESCROW_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  USDC_DECIMALS,
  MCP_CHAIN,
  erc20Abi,
  escrowAbi,
  serializeCall,
  type PreparedCall,
} from "./escrowConstants";
import {
  requireDeskWallet,
  verifyTxSucceeded,
  getBaseSepoliaPublicClient,
  verifyEscrowDepositInReceipt,
  verifyEscrowWithdrawalInReceipt,
} from "./deskByo";
import { shapePrepareResult } from "./intents";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

/** Operator-signed setDepositor when desk wallet is not yet registered on-chain. */
async function ensureDepositorOnChain(
  tokenId: number,
  depositorAddress: string
): Promise<void> {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { baseSepolia } = await import("viem/chains");

  const operatorKey = requireEnv("OPERATOR_PRIVATE_KEY");
  const account = privateKeyToAccount(operatorKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });
  const publicClient = await getBaseSepoliaPublicClient();

  const current = (await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "depositors",
    args: [BigInt(tokenId)],
  })) as string;

  if (current.toLowerCase() === depositorAddress.toLowerCase()) {
    return;
  }

  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "setDepositor",
    args: [BigInt(tokenId), depositorAddress as `0x${string}`],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(
      `setDepositor reverted on-chain (tx ${hash}) — operator ${account.address} may not be authorized on the escrow`
    );
  }

  // The public Base Sepolia RPC is load-balanced, so the very next read (and
  // the depositFor simulation that follows) can land on a node that has not yet
  // imported the block containing this setDepositor. Poll until the new
  // depositor is visible before returning, otherwise depositFor simulates
  // against stale state and reverts with "Not depositor".
  const want = depositorAddress.toLowerCase();
  for (let attempt = 0; attempt < 10; attempt++) {
    const seen = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "depositors",
      args: [BigInt(tokenId)],
    })) as string;
    if (seen.toLowerCase() === want) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `setDepositor confirmed (tx ${hash}) but depositor not yet visible on the RPC for token ${tokenId} — retry the fund in a few seconds`
  );
}

type PrepareActionResult = Record<string, unknown>;

/** Read escrow.getBalance and mirror it into the Convex trader row. Returns the new USDC balance. */
async function syncTraderEscrowFromChain(
  ctx: ActionCtx,
  publicClient: Awaited<ReturnType<typeof getBaseSepoliaPublicClient>>,
  tokenId: number,
  traderId: Id<"traders">
): Promise<number> {
  const escrowRaw = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: [BigInt(tokenId)],
  });
  const balanceUsdc = Number(escrowRaw) / USDC_DECIMALS;
  await ctx.runMutation(internal.traders.syncEscrowBalance, {
    traderId,
    balanceUsdc,
  });
  return balanceUsdc;
}

export const fundPrepareForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    amountUsdc: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareActionResult> => {
    await assertPerActionCap(
      ctx,
      args.deskManagerId,
      "fund_trader",
      args.amountUsdc
    );

    const amountAtomic = parseAmountUsdc(args.amountUsdc);
    const now = Date.now();

    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject) throw new Error("Desk not found");
    const deskAddress = requireDeskWallet(dm);
    if ((dm.walletBalanceUsdc ?? 0) < args.amountUsdc) {
      throw new Error(
        "Insufficient desk wallet balance — sync_wallet after funding your Base Account"
      );
    }

    const trader: Doc<"traders"> | null = await ctx.runQuery(
      internal.traders.loadInternal,
      { traderId: args.traderId }
    );
    assertTraderOwnedByDesk(trader, args.deskManagerId);
    if (trader.walletStatus !== "ready" || trader.tokenId == null) {
      throw new Error("Trader wallet must be ready before funding");
    }

    await ensureDepositorOnChain(trader.tokenId, deskAddress);

    const { encodeFunctionData } = await import("viem");
    const publicClient = await getBaseSepoliaPublicClient();

    const calls: PreparedCall[] = [];

    const currentAllowance = (await publicClient.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deskAddress, ESCROW_ADDRESS],
    })) as bigint;

    const needsApprove = currentAllowance < amountAtomic;
    if (needsApprove) {
      const approveAmount = usdcApproveAllowance(amountAtomic);
      await simulateUsdcApprove(
        publicClient,
        USDC_SEPOLIA_ADDRESS,
        deskAddress,
        ESCROW_ADDRESS,
        approveAmount
      );
      calls.push({
        to: USDC_SEPOLIA_ADDRESS,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, approveAmount],
        }),
      });
    }

    // depositFor performs usdc.safeTransferFrom(deskAddress, escrow, amount),
    // which requires allowance >= amount. When we batch a fresh approve above,
    // that approve has NOT executed on-chain yet, so simulating depositFor
    // against current state would always revert with "insufficient allowance".
    // The Base MCP send_calls batch runs approve→depositFor atomically and
    // confirm_intent verifies the tx succeeded, so only pre-simulate the
    // deposit when the allowance already exists.
    if (!needsApprove) {
      await simulateEscrowDepositFor(
        publicClient,
        ESCROW_ADDRESS,
        deskAddress,
        BigInt(trader.tokenId),
        amountAtomic
      );
    }

    calls.push({
      to: ESCROW_ADDRESS,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: escrowAbi,
        functionName: "depositFor",
        args: [BigInt(trader.tokenId), amountAtomic],
      }),
    });

    const intent = await ctx.runMutation(internal.mcp.intents.create, {
      deskManagerId: args.deskManagerId,
      intentType: "fund_trader",
      chain: MCP_CHAIN,
      calls: calls.map(serializeCall),
      payload: {
        traderId: args.traderId,
        amountUsdc: args.amountUsdc,
        traderName: trader.name,
        tokenId: trader.tokenId,
      },
      idempotencyKey: args.idempotencyKey,
      now,
    });

    return shapePrepareResult(
      intent,
      `Prepared fund ${args.amountUsdc.toFixed(2)} USDC for trader "${trader.name}" (${calls.length} call(s)).`
    );
  },
});

export const fundConfirmForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    intentId: v.id("mcpIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    const now = Date.now();
    const loaded = await ctx.runQuery(internal.mcp.intents.getForConfirm, {
      intentId: args.intentId,
      deskManagerId: args.deskManagerId,
      now,
    });

    if (loaded.alreadyConfirmed && loaded.intent.confirmResult) {
      return loaded.intent.confirmResult as McpTraderWriteResult;
    }

    const intent = loaded.intent;
    if (intent.intentType !== "fund_trader") {
      throw new Error("Intent type mismatch");
    }

    const payload = intent.payload as {
      traderId: Id<"traders">;
      amountUsdc: number;
      traderName: string;
      tokenId: number;
    };

    const amountAtomic = parseAmountUsdc(payload.amountUsdc);
    const { receipt, publicClient } = await verifyTxSucceeded(args.txHash);
    await verifyEscrowDepositInReceipt(receipt, {
      tokenId: payload.tokenId,
      amountAtomic,
    });
    const escrowBalanceUsdc = await syncTraderEscrowFromChain(
      ctx,
      publicClient,
      payload.tokenId,
      payload.traderId
    );

    const result: McpTraderWriteResult = {
      traderId: String(payload.traderId),
      txHash: args.txHash,
      summary: `Funded trader "${payload.traderName}" with ${payload.amountUsdc.toFixed(2)} USDC (escrow balance now ${escrowBalanceUsdc.toFixed(2)} USDC).`,
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

export const withdrawPrepareForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    amountUsdc: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PrepareActionResult> => {
    await assertPerActionCap(
      ctx,
      args.deskManagerId,
      "withdraw_from_trader",
      args.amountUsdc
    );

    const amountAtomic = parseAmountUsdc(args.amountUsdc);
    const now = Date.now();

    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject) throw new Error("Desk not found");
    const deskAddress = requireDeskWallet(dm);

    const trader: Doc<"traders"> | null = await ctx.runQuery(
      internal.traders.loadInternal,
      { traderId: args.traderId }
    );
    assertTraderOwnedByDesk(trader, args.deskManagerId);
    if (trader.walletStatus !== "ready" || trader.tokenId == null) {
      throw new Error("Trader wallet must be ready before withdrawal");
    }

    const escrowBalance = trader.escrowBalanceUsdc ?? 0;
    if (escrowBalance < args.amountUsdc) {
      throw new Error(
        `Insufficient escrow balance (${escrowBalance.toFixed(2)} USDC available)`
      );
    }

    const { encodeFunctionData } = await import("viem");
    const publicClient = await getBaseSepoliaPublicClient();

    await simulateEscrowTraderWithdraw(
      publicClient,
      ESCROW_ADDRESS,
      deskAddress,
      BigInt(trader.tokenId),
      amountAtomic
    );

    const withdrawCalls: PreparedCall[] = [
      {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: escrowAbi,
          functionName: "withdraw",
          args: [BigInt(trader.tokenId), amountAtomic] as const,
        }),
      },
    ];

    const intent = await ctx.runMutation(internal.mcp.intents.create, {
      deskManagerId: args.deskManagerId,
      intentType: "withdraw_from_trader",
      chain: MCP_CHAIN,
      calls: withdrawCalls.map(serializeCall),
      payload: {
        traderId: args.traderId,
        amountUsdc: args.amountUsdc,
        traderName: trader.name,
        tokenId: trader.tokenId,
      },
      idempotencyKey: args.idempotencyKey,
      now,
    });

    return shapePrepareResult(
      intent,
      `Prepared withdraw ${args.amountUsdc.toFixed(2)} USDC from trader "${trader.name}" to your Base Account.`
    );
  },
});

export const withdrawConfirmForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    intentId: v.id("mcpIntents"),
    txHash: v.string(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    const now = Date.now();
    const loaded = await ctx.runQuery(internal.mcp.intents.getForConfirm, {
      intentId: args.intentId,
      deskManagerId: args.deskManagerId,
      now,
    });

    if (loaded.alreadyConfirmed && loaded.intent.confirmResult) {
      return loaded.intent.confirmResult as McpTraderWriteResult;
    }

    const intent = loaded.intent;
    if (intent.intentType !== "withdraw_from_trader") {
      throw new Error("Intent type mismatch");
    }

    const payload = intent.payload as {
      traderId: Id<"traders">;
      amountUsdc: number;
      traderName: string;
      tokenId: number;
    };

    const amountAtomic = parseAmountUsdc(payload.amountUsdc);
    const { receipt, publicClient } = await verifyTxSucceeded(args.txHash);
    await verifyEscrowWithdrawalInReceipt(receipt, {
      tokenId: payload.tokenId,
      amountAtomic,
    });
    const escrowBalanceUsdc = await syncTraderEscrowFromChain(
      ctx,
      publicClient,
      payload.tokenId,
      payload.traderId
    );

    const result: McpTraderWriteResult = {
      traderId: String(payload.traderId),
      txHash: args.txHash,
      summary: `Withdrew ${payload.amountUsdc.toFixed(2)} USDC from trader "${payload.traderName}" to your Base Account (escrow ${escrowBalanceUsdc.toFixed(2)} USDC). Call sync_wallet to refresh desk balance.`,
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
