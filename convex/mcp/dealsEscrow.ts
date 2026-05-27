"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { mcpDeskCdpAccountName, parseAmountUsdc } from "./traders";
import type { McpDealWriteResult } from "./deals";
import { assertTradingHours } from "../lib/tradingHours";
import { assertPerActionCap } from "./limits";
import {
  simulateUsdcApprove,
  simulateEscrowCreateDeal,
  simulateEscrowCloseDeal,
} from "./simulate";

const USDC_DECIMALS = 1_000_000;

/**
 * Large allowance used when topping up the desk's USDC approval for the escrow
 * at deal-creation time. See `tradersEscrow.ts` for the same rationale: making
 * approve a one-time setup cost means subsequent create_deal calls only need
 * the single createDeal tx.
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
    name: "createDeal",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "potAmount", type: "uint256" },
      { name: "entryCost", type: "uint256" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "prompt", type: "string" },
          { name: "potAmount", type: "uint256" },
          { name: "entryCost", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "pendingEntries", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "DealCreated",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "prompt", type: "string", indexed: false },
      { name: "pot", type: "uint256", indexed: false },
      { name: "entryCost", type: "uint256", indexed: false },
    ],
  },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

/**
 * MCP `create_deal`: approve USDC if needed, call escrow `createDeal` from the
 * MCP desk CDP wallet, decode the `DealCreated` event to extract the on-chain
 * deal id, then record the open deal in Convex.
 */
export const createForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
  },
  handler: async (ctx, args): Promise<McpDealWriteResult> => {
    assertTradingHours();

    if (typeof args.prompt !== "string" || args.prompt.trim() === "") {
      throw new Error("prompt is required");
    }

    await assertPerActionCap(
      ctx,
      args.deskManagerId,
      "create_deal",
      args.potUsdc
    );

    const potAtomic = parseAmountUsdc(args.potUsdc);
    const entryCostAtomic = parseAmountUsdc(args.entryCostUsdc);
    if (entryCostAtomic > potAtomic) {
      throw new Error("entryCostUsdc must be <= potUsdc");
    }

    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject || !dm.walletAddress) {
      throw new Error("Desk not found or wallet not provisioned");
    }
    if ((dm.walletBalanceUsdc ?? 0) < args.potUsdc) {
      throw new Error(
        "Insufficient desk wallet balance — sync_wallet after funding the desk"
      );
    }

    const cdpApiKeyId = requireEnv("CDP_API_KEY_ID");
    const cdpApiKeySecret = requireEnv("CDP_API_KEY_SECRET");
    const cdpWalletSecret = requireEnv("CDP_WALLET_SECRET");

    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const { encodeFunctionData, createPublicClient, http, decodeEventLog } =
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

    // ── Allowance top-up (rare thanks to LARGE_APPROVE_ALLOWANCE) ─────────────
    // Same rationale as fund_trader: a large one-time approve makes any later
    // create_deal cheap (single createDeal tx). Idempotency on retries is
    // enforced one level up by mcpWriteRoute.
    const currentAllowance = (await publicClient.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deskAddress, ESCROW_ADDRESS],
    })) as bigint;

    if (currentAllowance < potAtomic) {
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
      const { transactionHash: approveHash } =
        await deskAccount.sendTransaction({
          transaction: {
            to: USDC_SEPOLIA_ADDRESS,
            value: BigInt(0),
            data: approveData,
          },
          network: "base-sepolia",
        });
      await publicClient.waitForTransactionReceipt({
        hash: approveHash as `0x${string}`,
      });
    }

    // ── escrow.createDeal ────────────────────────────────────────────────────
    // Pre-flight: simulate the createDeal call against the desk wallet.
    // Surfaces escrow reverts (insufficient allowance, paused, bad params)
    // before any tx is submitted.
    await simulateEscrowCreateDeal(
      publicClient,
      ESCROW_ADDRESS,
      deskAddress,
      args.prompt,
      potAtomic,
      entryCostAtomic
    );

    const createData = encodeFunctionData({
      abi: escrowAbi,
      functionName: "createDeal",
      args: [args.prompt, potAtomic, entryCostAtomic],
    });
    const { transactionHash: createHash } = await deskAccount.sendTransaction({
      transaction: {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: createData,
      },
      network: "base-sepolia",
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: createHash as `0x${string}`,
      confirmations: 2,
    });
    if (receipt.status === "reverted") {
      throw new Error("escrow.createDeal reverted");
    }

    let onChainDealId: number | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: escrowAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "DealCreated") {
          onChainDealId = Number((decoded.args as { dealId: bigint }).dealId);
          break;
        }
      } catch {
        // not our event
      }
    }
    if (onChainDealId === undefined) {
      throw new Error(
        "createDeal succeeded but DealCreated event was not found in tx logs"
      );
    }

    const recorded: McpDealWriteResult = await ctx.runMutation(
      internal.mcp.deals.recordOnChainCreationForMcp,
      {
        deskManagerId: args.deskManagerId,
        onChainDealId,
        onChainTxHash: createHash,
        prompt: args.prompt,
        potUsdc: args.potUsdc,
        entryCostUsdc: args.entryCostUsdc,
      }
    );

    return recorded;
  },
});

/**
 * MCP `close_deal`: verify the deal is owned by this MCP desk and currently
 * open with zero pending entries on-chain, call escrow `closeDeal`, then mark
 * the Convex `deals` row as closed.
 */
export const closeForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    dealId: v.id("deals"),
  },
  handler: async (ctx, args): Promise<McpDealWriteResult> => {
    assertTradingHours();

    const loaded = await ctx.runQuery(
      internal.mcp.deals.loadOwnedDealForClose,
      {
        deskManagerId: args.deskManagerId,
        dealId: args.dealId,
      }
    );

    if (!loaded.walletAddress) {
      throw new Error("Desk wallet not provisioned");
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

    const accountName = mcpDeskCdpAccountName(loaded.subject);
    const deskAccount = await cdp.evm.getOrCreateAccount({ name: accountName });
    const deskAddress = deskAccount.address as `0x${string}`;
    if (deskAddress.toLowerCase() !== loaded.walletAddress.toLowerCase()) {
      throw new Error("Desk CDP wallet address mismatch — contact support");
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    // Pre-flight: confirm the escrow agrees there are no pending entries.
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

    // Pre-flight: simulate the escrow.closeDeal call before submitting.
    await simulateEscrowCloseDeal(
      publicClient,
      ESCROW_ADDRESS,
      deskAddress,
      BigInt(loaded.onChainDealId)
    );

    const closeData = encodeFunctionData({
      abi: escrowAbi,
      functionName: "closeDeal",
      args: [BigInt(loaded.onChainDealId)],
    });
    const { transactionHash } = await deskAccount.sendTransaction({
      transaction: {
        to: ESCROW_ADDRESS,
        value: BigInt(0),
        data: closeData,
      },
      network: "base-sepolia",
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash as `0x${string}`,
      confirmations: 2,
    });
    if (receipt.status === "reverted") {
      throw new Error("escrow.closeDeal reverted");
    }

    await ctx.runMutation(internal.mcp.deals.markDealClosedForMcp, {
      deskManagerId: args.deskManagerId,
      dealId: args.dealId,
    });

    return {
      dealId: String(args.dealId),
      onChainDealId: loaded.onChainDealId,
      txHash: transactionHash,
      walletAddress: loaded.walletAddress,
      summary: `Closed deal #${loaded.onChainDealId}. Remaining pot returned to desk wallet — call sync_wallet to refresh balance.`,
    };
  },
});
