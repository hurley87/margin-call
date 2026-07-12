import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  resolveReadyProfileImageUrl,
  resolveTraderProfileImageUrl,
} from "./lib/profileImage";
import { readPublicTraits } from "./lib/portraitSeed";
import { isMcpSubject } from "./mcp/subject";
import { mapDisplayTiersByTraderId } from "./seatVault/publicDisplay";
import { seatTierValidator } from "./seatVault/validators";

const FEATURED_TRADER_NAMES = ["HurlingAlpha", "Wolf"] as const;
const LANDING_ROSTER_DEFAULT_LIMIT = 4;
const LANDING_ROSTER_MAX_LIMIT = 12;
const LANDING_ROSTER_CANDIDATE_LIMIT = 48;

const publicTraitsValidator = v.union(
  v.object({
    expression: v.string(),
    fieldInk: v.string(),
    attire: v.string(),
    vice: v.string(),
    fieldFlourish: v.string(),
  }),
  v.null()
);

const landingRosterTraderValidator = v.object({
  id: v.id("traders"),
  name: v.string(),
  profileImageUrl: v.string(),
  traits: publicTraitsValidator,
  /** Public floor credential only — never staker/pending/unlock. */
  effectiveTier: seatTierValidator,
});

type Stats = {
  pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deals: number;
};

async function findFeaturedTrader(
  ctx: QueryCtx,
  name: (typeof FEATURED_TRADER_NAMES)[number]
): Promise<Doc<"traders"> | null> {
  const normalizedName = name.toLowerCase();
  const normalizedMatch = await ctx.db
    .query("traders")
    .withIndex("byNameLower", (q) => q.eq("nameLower", normalizedName))
    .first();
  if (normalizedMatch) return normalizedMatch;

  // Legacy traders may predate `nameLower`; preserve the existing named pins.
  return await ctx.db
    .query("traders")
    .withIndex("byName", (q) => q.eq("name", name))
    .first();
}

/**
 * Public landing roster: featured portrait-ready traders followed by the
 * newest ready portraits. This intentionally excludes gameplay aggregates.
 */
export const listLandingRoster = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(landingRosterTraderValidator),
  handler: async (ctx, { limit = LANDING_ROSTER_DEFAULT_LIMIT }) => {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : LANDING_ROSTER_DEFAULT_LIMIT;
    const cappedLimit = Math.min(
      Math.max(normalizedLimit, 1),
      LANDING_ROSTER_MAX_LIMIT
    );
    const [featuredTraders, recentReadyTraders] = await Promise.all([
      Promise.all(
        FEATURED_TRADER_NAMES.map((name) => findFeaturedTrader(ctx, name))
      ),
      ctx.db
        .query("traders")
        .withIndex("byImageStatusAndCreatedAt", (q) =>
          q.eq("imageStatus", "ready")
        )
        .order("desc")
        .take(LANDING_ROSTER_CANDIDATE_LIMIT),
    ]);

    const orderedCandidates = [
      ...featuredTraders.filter(
        (trader): trader is Doc<"traders"> => trader !== null
      ),
      ...recentReadyTraders,
    ];
    const seenTraderIds = new Set<string>();
    const pending: Array<{
      id: Doc<"traders">["_id"];
      name: string;
      profileImageUrl: string;
      traits: ReturnType<typeof readPublicTraits>;
    }> = [];

    for (const trader of orderedCandidates) {
      if (pending.length >= cappedLimit) break;
      if (seenTraderIds.has(trader._id)) continue;
      seenTraderIds.add(trader._id);

      const profileImageUrl = await resolveReadyProfileImageUrl(ctx, trader);
      if (!profileImageUrl) continue;

      pending.push({
        id: trader._id,
        name: trader.name,
        profileImageUrl,
        traits: readPublicTraits(trader.imagePromptSource),
      });
    }

    const tiers = await mapDisplayTiersByTraderId(
      ctx,
      pending.map((row) => row.id)
    );

    return pending.map((row) => ({
      ...row,
      effectiveTier: tiers.get(String(row.id)) ?? "Gallery",
    }));
  },
});

/** Public leaderboard: all traders, sorted by total equity. No auth. */
export const listTraderStats = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, { limit = 50 }) => {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const traders = await ctx.db.query("traders").take(500);
    if (traders.length === 0) return [];

    const [outcomes, assets] = await Promise.all([
      ctx.db.query("dealOutcomes").take(5000),
      ctx.db.query("assets").take(2000),
    ]);

    const statsMap = new Map<string, Stats>();
    for (const o of outcomes) {
      const key = o.traderId;
      const prev = statsMap.get(key) ?? {
        pnl: 0,
        wins: 0,
        losses: 0,
        wipeouts: 0,
        deals: 0,
      };
      prev.pnl += o.traderPnlUsdc ?? 0;
      prev.deals += 1;
      if (o.traderWipedOut) prev.wipeouts += 1;
      else if ((o.traderPnlUsdc ?? 0) > 0) prev.wins += 1;
      else prev.losses += 1;
      statsMap.set(key, prev);
    }

    const assetMap = new Map<string, number>();
    for (const a of assets) {
      const tid = a.traderId;
      assetMap.set(tid, (assetMap.get(tid) ?? 0) + (a.valueUsdc ?? 0));
    }

    const deskIds = [...new Set(traders.map((t) => t.deskManagerId))];
    const deskWalletById = new Map<string, string | undefined>();
    const isAgentDeskById = new Map<string, boolean>();
    for (const deskId of deskIds) {
      const dm = await ctx.db.get(deskId);
      deskWalletById.set(String(deskId), dm?.walletAddress);
      isAgentDeskById.set(String(deskId), isMcpSubject(dm?.subject));
    }

    const tiers = await mapDisplayTiersByTraderId(
      ctx,
      traders.map((t) => t._id)
    );

    const leaderboard = await Promise.all(
      traders.map(async (t) => {
        const tid = t._id;
        const s = statsMap.get(tid) ?? {
          pnl: 0,
          wins: 0,
          losses: 0,
          wipeouts: 0,
          deals: 0,
        };
        const assetValue = assetMap.get(tid) ?? 0;
        const escrow = t.escrowBalanceUsdc ?? 0;
        const totalDealsLogged = s.wins + s.losses + s.wipeouts;
        const ownerWallet = deskWalletById.get(String(t.deskManagerId)) ?? "";
        const profileImageUrl = await resolveTraderProfileImageUrl(ctx, t);
        const isAgentDesk =
          isAgentDeskById.get(String(t.deskManagerId)) ?? false;

        return {
          id: tid,
          name: t.name,
          status: t.status as string,
          owner_address: ownerWallet,
          imageStatus: t.imageStatus ?? null,
          profileImageUrl,
          traits: readPublicTraits(t.imagePromptSource),
          total_pnl: s.pnl,
          wins: s.wins,
          losses: s.losses,
          wipeouts: s.wipeouts,
          deal_count: s.deals,
          win_rate:
            totalDealsLogged > 0 ? (s.wins / totalDealsLogged) * 100 : 0,
          total_value: escrow + assetValue,
          is_agent_desk: isAgentDesk,
          effectiveTier: tiers.get(String(tid)) ?? "Gallery",
        };
      })
    );

    leaderboard.sort(
      (a, b) => b.total_pnl - a.total_pnl || b.total_value - a.total_value
    );
    return leaderboard.slice(0, cappedLimit);
  },
});
