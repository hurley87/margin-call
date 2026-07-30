"use node";

import { v } from "convex/values";

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
import { STARTER_GRANT_CONFIG } from "./lib/starterGrantConfig";

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

    const cfg = STARTER_GRANT_CONFIG;
    if (existing) {
      return {
        kind: "already_granted",
        configVersion: cfg.version,
      };
    }

    const grantedAt = Date.now();
    const txHash = await mintMockUsd(wallet, cfg.grantAmount);

    await ctx.runMutation(internal.starterGrants.recordGrant, {
      walletAddress: wallet,
      privySubject: identity.subject,
      grantAmount: cfg.grantAmount,
      configVersion: cfg.version,
      grantedAt,
      txHash,
    });

    return {
      kind: "grant",
      amount: cfg.grantAmount,
      txHash,
      configVersion: cfg.version,
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

    const cfg = STARTER_GRANT_CONFIG;
    if (!existing) {
      throw new Error("Claim the Starter Grant before requesting a refill");
    }
    if (existing.privySubject !== identity.subject) {
      throw new Error("Wallet grant belongs to a different account");
    }

    const now = Date.now();
    const last: number = existing.lastRefillAt ?? existing.grantedAt;
    const availableAt: number = last + cfg.refillCooldownMs;
    if (now < availableAt) {
      return {
        kind: "cooldown",
        availableAt,
        configVersion: cfg.version,
      };
    }

    const txHash = await mintMockUsd(wallet, cfg.refillAmount);

    await ctx.runMutation(internal.starterGrants.recordRefill, {
      walletAddress: wallet,
      privySubject: identity.subject,
      refilledAt: now,
      txHash,
    });

    return {
      kind: "refill",
      amount: cfg.refillAmount,
      txHash,
      availableAt: now + cfg.refillCooldownMs,
      configVersion: cfg.version,
    };
  },
});
