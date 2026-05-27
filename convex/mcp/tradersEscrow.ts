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

const USDC_DECIMALS = 1_000_000;

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
 * MCP `fund_trader`: approve USDC (if needed), depositFor, sync escrow balance.
 */
export const fundForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    amountUsdc: v.number(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
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

    const allowance = (await publicClient.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deskAddress, ESCROW_ADDRESS],
    })) as bigint;

    let lastTxHash: string | undefined;

    if (allowance < amountAtomic) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [ESCROW_ADDRESS, amountAtomic],
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
