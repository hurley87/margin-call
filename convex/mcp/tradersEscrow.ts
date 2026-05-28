"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mcpDeskCdpAccountName,
  parseAmountUsdc,
  type McpTraderWriteResult,
} from "./traders";
import { assertTraderOwnedByDesk } from "../traders";
import { assertPerActionCap } from "./limits";
import {
  simulateUsdcApprove,
  simulateEscrowDepositFor,
  simulateEscrowTraderWithdraw,
} from "./simulate";

const USDC_DECIMALS = 1_000_000;

/**
 * Large allowance used when topping up the desk's USDC approval for the escrow.
 * Using a large value (instead of the exact per-fund amount) makes the approve
 * transaction a rare, one-time (or very infrequent) setup cost per desk.
 * All subsequent fund calls — including retries with fresh idempotencyKeys after
 * a prior partial failure — will see a sufficient allowance and skip the approve
 * step entirely, keeping the expensive on-chain leg to the actual depositFor.
 */
const LARGE_APPROVE_ALLOWANCE = BigInt(10_000_000) * BigInt(USDC_DECIMALS); // 10M USDC

const ESCROW_ADDRESS = "0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609" as const;
const USDC_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const escrowAbi = [
  {
    type: "function",
    name: "depositFor",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositors",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setDepositor",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "depositor", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBalance",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

/** Operator-signed setDepositor when desk wallet is not yet registered. */
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
  const { createPublicClient } = await import("viem");
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

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
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * MCP `fund_trader`: ensure depositor, top-up allowance (large amount when needed),
 * call escrow depositFor, then sync the Convex escrow balance.
 *
 * The large allowance strategy + fresh-key-on-error contract makes the overall
 * flow resilient to the inherent non-atomicity of two on-chain transactions
 * from a plain EVM server account. See the LARGE_APPROVE_ALLOWANCE constant
 * and the comments inside the implementation for the detailed rationale.
 */
export const fundForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    amountUsdc: v.number(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    await assertPerActionCap(
      ctx,
      args.deskManagerId,
      "fund_trader",
      args.amountUsdc
    );

    const amountAtomic = parseAmountUsdc(args.amountUsdc);

    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject || !dm.walletAddress) {
      throw new Error("Desk not found or wallet not provisioned");
    }
    if ((dm.walletBalanceUsdc ?? 0) < args.amountUsdc) {
      throw new Error(
        "Insufficient desk wallet balance — sync_wallet after funding the desk"
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

    const cdpApiKeyId = requireEnv("CDP_API_KEY_ID");
    const cdpApiKeySecret = requireEnv("CDP_API_KEY_SECRET");
    const cdpWalletSecret = requireEnv("CDP_WALLET_SECRET");

    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const { encodeFunctionData, createPublicClient, http } =
      await import("viem");
    const { baseSepolia } = await import("viem/chains");

    const cdp = new CdpClient({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      walletSecret: cdpWalletSecret,
    });

    const accountName = mcpDeskCdpAccountName(dm.subject);
    const deskAccount = await cdp.evm.getOrCreateAccount({ name: accountName });
    const deskAddress = deskAccount.address as `0x${string}`;

    if (deskAddress.toLowerCase() !== dm.walletAddress.toLowerCase()) {
      throw new Error("Desk CDP wallet address mismatch — contact support");
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    await ensureDepositorOnChain(trader.tokenId, deskAddress);

    await simulateEscrowDepositFor(
      publicClient,
      ESCROW_ADDRESS,
      deskAddress,
      BigInt(trader.tokenId),
      amountAtomic
    );

    // ── Allowance top-up (rare thanks to LARGE_APPROVE_ALLOWANCE) ─────────────
    // We deliberately approve a *large* amount (not the exact per-call amount)
    // when the current allowance is insufficient. This turns the approve tx
    // into a one-time (or extremely rare) setup cost for the desk. Any later
    // fund_trader call — including a retry with a *fresh* idempotencyKey after
    // a previous partial failure (approve succeeded, deposit failed, etc.) —
    // will see a sufficient allowance and execute *only* the single depositFor
    // transaction. This is the practical mitigation for the non-atomic nature
    // of funding from a plain EVM server account (two separate on-chain txs).
    let lastTxHash: string | undefined;

    const currentAllowance = (await publicClient.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deskAddress, ESCROW_ADDRESS],
    })) as bigint;

    if (currentAllowance < amountAtomic) {
      await simulateUsdcApprove(
        publicClient,
        USDC_SEPOLIA_ADDRESS,
        deskAddress,
        ESCROW_ADDRESS,
        LARGE_APPROVE_ALLOWANCE
      );
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [ESCROW_ADDRESS, LARGE_APPROVE_ALLOWANCE],
      });
      const { transactionHash } = await deskAccount.sendTransaction({
        transaction: {
          to: USDC_SEPOLIA_ADDRESS,
          value: BigInt(0),
          data: approveData,
        },
        network: "base-sepolia",
      });
      lastTxHash = transactionHash;
      await publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
      });
    }

    // ── Core money movement for this funding intent ───────────────────────────
    // The depositFor is the on-chain step that actually moves the USDC into
    // the trader's escrow. It is the last on-chain write on the happy path.
    // Per the documented contract for all MCP writes, any failure (including
    // after the tx has confirmed but before Convex is updated) requires a
    // *fresh* idempotencyKey to re-attempt. The large allowance above ensures
    // such retries are cheap (usually just the deposit tx).
    const depositData = encodeFunctionData({
      abi: escrowAbi,
      functionName: "depositFor",
      args: [BigInt(trader.tokenId), amountAtomic],
    });
    const { transactionHash: depositHash } = await deskAccount.sendTransaction({
      transaction: {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: depositData,
      },
      network: "base-sepolia",
    });
    lastTxHash = depositHash;
    await publicClient.waitForTransactionReceipt({
      hash: depositHash as `0x${string}`,
      confirmations: 2,
    });

    const escrowRaw = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getBalance",
      args: [BigInt(trader.tokenId)],
    });
    const escrowBalanceUsdc = Number(escrowRaw) / USDC_DECIMALS;
    await ctx.runMutation(internal.traders.syncEscrowBalance, {
      traderId: args.traderId,
      balanceUsdc: escrowBalanceUsdc,
    });

    return {
      traderId: String(args.traderId),
      txHash: lastTxHash,
      summary: `Funded trader "${trader.name}" with ${args.amountUsdc.toFixed(2)} USDC (escrow balance now ${escrowBalanceUsdc.toFixed(2)} USDC).`,
    };
  },
});

/**
 * MCP `withdraw_from_trader`: escrow withdraw → desk wallet, sync escrow balance.
 */
export const withdrawForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    amountUsdc: v.number(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    await assertPerActionCap(
      ctx,
      args.deskManagerId,
      "withdraw_from_trader",
      args.amountUsdc
    );

    const amountAtomic = parseAmountUsdc(args.amountUsdc);

    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject || !dm.walletAddress) {
      throw new Error("Desk not found or wallet not provisioned");
    }

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

    const cdpApiKeyId = requireEnv("CDP_API_KEY_ID");
    const cdpApiKeySecret = requireEnv("CDP_API_KEY_SECRET");
    const cdpWalletSecret = requireEnv("CDP_WALLET_SECRET");

    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const { encodeFunctionData, createPublicClient, http } =
      await import("viem");
    const { baseSepolia } = await import("viem/chains");

    const cdp = new CdpClient({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      walletSecret: cdpWalletSecret,
    });

    const accountName = mcpDeskCdpAccountName(dm.subject);
    const deskAccount = await cdp.evm.getOrCreateAccount({ name: accountName });

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    await simulateEscrowTraderWithdraw(
      publicClient,
      ESCROW_ADDRESS,
      deskAccount.address as `0x${string}`,
      BigInt(trader.tokenId),
      amountAtomic
    );

    const withdrawData = encodeFunctionData({
      abi: escrowAbi,
      functionName: "withdraw",
      args: [BigInt(trader.tokenId), amountAtomic],
    });
    const { transactionHash } = await deskAccount.sendTransaction({
      transaction: {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: withdrawData,
      },
      network: "base-sepolia",
    });
    await publicClient.waitForTransactionReceipt({
      hash: transactionHash as `0x${string}`,
      confirmations: 2,
    });

    const escrowRaw = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getBalance",
      args: [BigInt(trader.tokenId)],
    });
    const escrowBalanceUsdc = Number(escrowRaw) / USDC_DECIMALS;
    await ctx.runMutation(internal.traders.syncEscrowBalance, {
      traderId: args.traderId,
      balanceUsdc: escrowBalanceUsdc,
    });

    return {
      traderId: String(args.traderId),
      txHash: transactionHash,
      summary: `Withdrew ${args.amountUsdc.toFixed(2)} USDC from trader "${trader.name}" to desk wallet (escrow balance now ${escrowBalanceUsdc.toFixed(2)} USDC). Use sync_wallet to refresh desk balance.`,
    };
  },
});
