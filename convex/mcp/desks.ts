import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { assertPerActionCap } from "./limits";
import { simulateUsdcTransfer } from "./simulate";

/**
 * Read-only desk snapshot for MCP get_desk. Called from the mcp/* HTTP action
 * after service-token validation; `since` is supplied by the caller so this
 * query handler never invokes Date.now() (Convex guideline).
 */
export const getState = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    since: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, since, now }) => {
    const desk = await ctx.db.get(deskManagerId);
    if (!desk) {
      throw new Error("Desk not found");
    }

    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .take(50);

    const openDeals = await ctx.db
      .query("deals")
      .withIndex("byCreatorAndStatus", (q) =>
        q.eq("creatorDeskManagerId", deskManagerId).eq("status", "open")
      )
      .take(50);

    // OUTCOME_LIMIT is generous enough to cover a heavy 30-day window per
    // trader; if a trader exceeds it we silently undercount, acceptable for a
    // snapshot. Drop to a proper byTraderAndCreatedAt index when this becomes
    // hot.
    const OUTCOME_LIMIT = 200;
    const outcomesByTrader = await Promise.all(
      traders.map((t) =>
        ctx.db
          .query("dealOutcomes")
          .withIndex("byTrader", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(OUTCOME_LIMIT)
      )
    );

    let recentPnlUsdc = 0;
    for (const outs of outcomesByTrader) {
      for (const o of outs) {
        if (o.createdAt >= since && typeof o.traderPnlUsdc === "number") {
          recentPnlUsdc += o.traderPnlUsdc;
        }
      }
    }

    const walletAddress = desk.walletAddress ?? null;
    const balance = desk.walletBalanceUsdc ?? 0;
    const traderCount = traders.length;
    const openDealCount = openDeals.length;

    // Optional pending approvals snapshot (when caller supplies `now`)
    let pendingApprovals:
      | { count: number; oldestAgeSeconds: number | null }
      | undefined;
    if (typeof now === "number") {
      const pending = await ctx.db
        .query("dealApprovals")
        .withIndex("byDeskManagerAndStatus", (q) =>
          q.eq("deskManagerId", deskManagerId).eq("status", "pending")
        )
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .collect();
      const count = pending.length;
      const oldestAgeSeconds =
        count > 0
          ? Math.floor(
              (now - Math.min(...pending.map((p) => p.createdAt))) / 1000
            )
          : null;
      pendingApprovals = { count, oldestAgeSeconds };
    }

    let summary: string;
    if (!walletAddress) {
      summary =
        "Desk wallet not yet provisioned. Sign in to the Margin Call web app to finish setup.";
    } else if (balance <= 0) {
      summary = `Send USDC to ${walletAddress} (Base Sepolia) to fund this desk.`;
    } else {
      const pa = pendingApprovals
        ? ` • ${pendingApprovals.count} pending approval(s)`
        : "";
      summary = `Balance: ${balance.toFixed(2)} USDC • ${traderCount} trader(s) • ${openDealCount} open deal(s) • Recent P&L: ${recentPnlUsdc.toFixed(2)} USDC${pa}`;
    }

    const allowlist = desk.withdrawAllowlist ?? [];
    const ceremonyDone = !!desk.withdrawCeremonyCompletedAt;
    const dailyCap = desk.dailyWithdrawCapUsdc ?? 1000;
    const dailyUsed = desk.dailyWithdrawUsedUsdc ?? 0;
    const pendingProposal = desk.pendingWithdrawAddress;

    return {
      deskId: deskManagerId,
      walletAddress,
      walletBalanceUsdc: balance,
      walletBalanceSyncedAt: desk.walletBalanceSyncedAt,
      traderCount,
      openDealCount,
      recentPnlUsdc,
      pendingApprovals,
      summary,
      // Phase 6 withdrawal surface for Claude / MCP
      withdraw: {
        allowlistCount: allowlist.length,
        ceremonyCompleted: ceremonyDone,
        dailyCapUsdc: dailyCap,
        dailyUsedUsdc: dailyUsed,
        pendingProposal: pendingProposal ?? undefined,
        allowlistSample: allowlist.slice(0, 3), // first few for visibility (never log secrets)
      },
    };
  },
});

/** Normalize an EVM address for storage/comparison (lowercase, 0x prefix). */
function normalizeAddress(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!a.startsWith("0x") || a.length !== 42) {
    throw new Error("Invalid withdrawal address (must be 0x... 42 chars)");
  }
  return a;
}

/** Check if address is in the desk's allowlist (case-insensitive after norm). */
function isAllowlisted(
  allowlist: string[] | undefined,
  candidate: string
): boolean {
  if (!allowlist || allowlist.length === 0) return false;
  const norm = normalizeAddress(candidate);
  return allowlist.some((a) => a.toLowerCase() === norm);
}

/** Compute start of current UTC day (for daily cap reset). */
function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

type WithdrawToAddressResult = {
  ok: true;
  txHash: string;
  to: string;
  amountUsdc: number;
  dailyUsedAfter: number;
};

/**
 * MCP `register_withdraw_address` (internal mutation, called from http write route).
 * Enforces: first registration per desk requires completed ceremony (human confirmation in web UI).
 * After ceremony, subsequent registrations append to allowlist (policy allows post-ceremony).
 * Always requires idempotencyKey (handled by caller).
 */
export const registerWithdrawAddress = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    address: v.string(),
  },
  handler: async (ctx: any, { deskManagerId, address }: any) => {
    const desk = await ctx.db.get(deskManagerId);
    if (!desk) throw new Error("Desk not found");

    const norm = normalizeAddress(address);

    const now = Date.now();
    const ceremonyDone = !!desk.withdrawCeremonyCompletedAt;

    if (!ceremonyDone) {
      // First (or unconfirmed) registration → queue ceremony
      if (desk.pendingWithdrawAddress === norm) {
        return {
          ok: false as const,
          error:
            "Withdrawal address registration ceremony is pending. The human operator who issued the MCP key must confirm this address in the Margin Call web app (My Agent Desks section).",
          pending: true,
          proposedAddress: norm,
        };
      }
      await ctx.db.patch(deskManagerId, {
        pendingWithdrawAddress: norm,
        pendingWithdrawCeremonyAt: now,
        updatedAt: now,
      });
      return {
        ok: false as const,
        error:
          "First withdrawal address registration requires a one-time Privy-authenticated confirmation ceremony. The proposed address has been recorded; the issuing human must confirm it in the web UI to bind and activate withdrawals.",
        pending: true,
        proposedAddress: norm,
      };
    }

    // Ceremony complete → allow append (or dedupe)
    const current: string[] = desk.withdrawAllowlist ?? [];
    if (current.some((a) => a.toLowerCase() === norm)) {
      return {
        ok: true as const,
        address: norm,
        allowlist: current,
        alreadyRegistered: true,
      };
    }

    const updated = [...current, norm];
    await ctx.db.patch(deskManagerId, {
      withdrawAllowlist: updated,
      withdrawAllowlistUpdatedAt: now,
      updatedAt: now,
    });

    return {
      ok: true as const,
      address: norm,
      allowlist: updated,
      alreadyRegistered: false,
    };
  },
});

/**
 * MCP `withdraw_to_address` — performs USDC transfer via CDP EVM account.
 * This is an internalAction (runs with "use node" for CDP SDK + network).
 * Called only after mcpWriteRoute has passed idempotency + auth.
 */
export const withdrawToAddress = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    address: v.string(),
    amountUsdc: v.number(), // human units, e.g. 123.45
  },
  handler: async (
    ctx: any,
    { deskManagerId, address, amountUsdc }: any
  ): Promise<WithdrawToAddressResult> => {
    await assertPerActionCap(
      ctx,
      deskManagerId,
      "withdraw_to_address",
      amountUsdc
    );

    const desk = await ctx.runQuery(internal.deskManagers.getByIdInternal, {
      id: deskManagerId,
    });
    if (!desk) throw new Error("Desk not found for withdrawal");

    if ((desk.walletBalanceUsdc ?? 0) < amountUsdc) {
      throw new Error(
        `Insufficient balance: have ${(desk.walletBalanceUsdc ?? 0).toFixed(2)}, requested ${amountUsdc.toFixed(2)} USDC`
      );
    }

    const normDest = normalizeAddress(address);
    if (!isAllowlisted(desk.withdrawAllowlist, normDest)) {
      throw new Error(
        `Destination ${normDest} is not on this desk's withdrawal allowlist. Use register_withdraw_address (after ceremony) to add it.`
      );
    }

    // Daily cap check + reset
    const now = Date.now();
    const cap = desk.dailyWithdrawCapUsdc ?? 1000;
    let used = desk.dailyWithdrawUsedUsdc ?? 0;
    const lastReset = desk.dailyWithdrawResetAt ?? 0;
    const todayStart = startOfUtcDay(now);
    if (lastReset < todayStart) {
      used = 0;
    }
    if (used + amountUsdc > cap) {
      throw new Error(
        `Daily withdrawal cap exceeded: used ${used.toFixed(2)} + ${amountUsdc.toFixed(2)} > cap ${cap} USDC. Cap resets at UTC midnight.`
      );
    }

    // Perform the on-chain transfer using CDP EVM account (same as issuance)
    if (!desk.cdpAccountName) {
      throw new Error(
        "Desk CDP account name not recorded; cannot initiate transfer (re-issue key or contact operator)"
      );
    }
    if (!desk.walletAddress) {
      throw new Error("Desk wallet address not provisioned");
    }

    const cdpApiKeyId = process.env.CDP_API_KEY_ID;
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
    const cdpWalletSecret = process.env.CDP_WALLET_SECRET;
    if (!cdpApiKeyId || !cdpApiKeySecret || !cdpWalletSecret) {
      throw new Error(
        "CDP credentials not configured on Convex for withdrawal"
      );
    }

    const { CdpClient } = await import("@coinbase/cdp-sdk");

    const cdp = new CdpClient({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      walletSecret: cdpWalletSecret,
    });

    const account = await cdp.evm.getOrCreateAccount({
      name: desk.cdpAccountName,
    });

    // amount in USDC smallest units (6 decimals)
    const amountUnits = BigInt(Math.floor(amountUsdc * 1_000_000));

    const { createPublicClient, http } = await import("viem");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const USDC_SEPOLIA_ADDRESS =
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
    await simulateUsdcTransfer(
      publicClient,
      USDC_SEPOLIA_ADDRESS,
      account.address as `0x${string}`,
      normDest as `0x${string}`,
      amountUnits
    );

    const { transactionHash } = await account.transfer({
      to: normDest as `0x${string}`,
      amount: amountUnits,
      token: "usdc",
      network: "base-sepolia",
    });

    // Update desk balance used + daily state (optimistic; sync_wallet will reconcile on-chain)
    const newUsed = used + amountUsdc;
    await ctx.runMutation(internal.deskManagers.recordWithdrawUsage, {
      deskManagerId,
      amountUsdc,
      newDailyUsed: newUsed,
      resetAt: todayStart,
      txHash: transactionHash,
    });

    // Also sync the new on-chain balance (best effort)
    // Note: caller of withdraw should call sync_wallet after to refresh get_desk view.

    return {
      ok: true as const,
      txHash: transactionHash,
      to: normDest,
      amountUsdc,
      dailyUsedAfter: newUsed,
    };
  },
});
