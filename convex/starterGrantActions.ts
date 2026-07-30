"use node";

import { v } from "convex/values";
import {
  decideRefill,
  decideStarterGrant,
  type GrantRecord,
} from "@margin-call/shared";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { mockUsdAbi } from "./lib/chain/abis";
import { requireIndexerAddresses } from "./lib/chain/addresses";
import {
  createChainPublicClient,
  createMinterWalletClient,
  parsePrivateKey,
} from "./lib/chain/clients";
import { normalizeWalletAddress } from "./lib/chain/walletAddress";

type ClaimResult = {
  kind: "grant" | "refill" | "already_granted" | "cooldown";
  amount?: number;
  txHash?: string;
  availableAt?: number;
  configVersion: number;
};

const claimResultValidator = v.object({
  kind: v.union(
    v.literal("grant"),
    v.literal("refill"),
    v.literal("already_granted"),
    v.literal("cooldown")
  ),
  amount: v.optional(v.number()),
  txHash: v.optional(v.string()),
  availableAt: v.optional(v.number()),
  configVersion: v.number(),
});

function requireMinterKey(): string {
  const key = process.env.STARTER_GRANT_MINTER_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      "STARTER_GRANT_MINTER_PRIVATE_KEY is not set in Convex env"
    );
  }
  return key;
}

function toGrantRecord(
  existing: {
    grantedAt: number;
    lastRefillAt: number | null;
    configVersion: number;
  } | null
): GrantRecord | null {
  if (!existing) return null;
  return {
    grantedAt: existing.grantedAt,
    lastRefillAt: existing.lastRefillAt,
    configVersion: existing.configVersion,
  };
}

async function mintMockUsd(to: `0x${string}`, amount: number): Promise<string> {
  const addresses = requireIndexerAddresses();
  const privateKey = parsePrivateKey(requireMinterKey());
  const wallet = createMinterWalletClient(privateKey);
  const publicClient = createChainPublicClient();
  const account = wallet.account;
  if (!account) {
    throw new Error("Minter wallet has no account");
  }

  const hash = await wallet.writeContract({
    address: addresses.mockUsd,
    abi: mockUsdAbi,
    functionName: "mint",
    args: [to, BigInt(amount)],
    account,
    chain: wallet.chain,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** One-time Starter Grant for a newly connected wallet. */
export const claimStarterGrant = action({
  args: { walletAddress: v.string() },
  returns: claimResultValidator,
  handler: async (ctx, args): Promise<ClaimResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const wallet = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.runQuery(internal.starterGrants.getByWallet, {
      walletAddress: wallet,
    });

    const decision = decideStarterGrant(toGrantRecord(existing));
    if (decision.kind !== "grant") {
      return {
        kind: decision.kind,
        configVersion: decision.configVersion,
      };
    }

    const grantedAt = Date.now();
    const txHash = await mintMockUsd(wallet, decision.amount);

    await ctx.runMutation(internal.starterGrants.recordGrant, {
      walletAddress: wallet,
      privySubject: identity.subject,
      grantAmount: decision.amount,
      configVersion: decision.configVersion,
      grantedAt,
      txHash,
    });

    return {
      kind: "grant",
      amount: decision.amount,
      txHash,
      configVersion: decision.configVersion,
    };
  },
});

/** Rate-limited MockUSD refill (manual claim). */
export const claimRefill = action({
  args: { walletAddress: v.string() },
  returns: claimResultValidator,
  handler: async (ctx, args): Promise<ClaimResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const wallet = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.runQuery(internal.starterGrants.getByWallet, {
      walletAddress: wallet,
    });

    if (!existing) {
      throw new Error("Claim the Starter Grant before requesting a refill");
    }
    if (existing.privySubject !== identity.subject) {
      throw new Error("Wallet grant belongs to a different account");
    }

    const now = Date.now();
    const decision = decideRefill(toGrantRecord(existing), now);
    if (decision.kind === "cooldown") {
      return {
        kind: "cooldown",
        availableAt: decision.availableAt,
        configVersion: decision.configVersion,
      };
    }
    if (decision.kind !== "refill") {
      // decideRefill only returns grant when record is null (handled above).
      throw new Error("Unexpected grant decision for refill");
    }

    const txHash = await mintMockUsd(wallet, decision.amount);

    await ctx.runMutation(internal.starterGrants.recordRefill, {
      walletAddress: wallet,
      privySubject: identity.subject,
      refilledAt: now,
      txHash,
    });

    return {
      kind: "refill",
      amount: decision.amount,
      txHash,
      availableAt: decision.availableAt,
      configVersion: decision.configVersion,
    };
  },
});
