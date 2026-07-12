import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  CORNER_OFFICE_THRESHOLD_WEI,
  SEAT_THRESHOLD_WEI,
  SEAT_VAULT_V1,
} from "../../convex/seatVault/policy";
import { makeT, seedActiveTrader, seedDeskManager, seedDeal } from "./setup";

const VAULT = SEAT_VAULT_V1.address.toLowerCase();
const STAKER = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";

async function seedReconciledTier(
  t: ReturnType<typeof makeT>,
  args: {
    traderId: string;
    onChainTraderId: number;
    effectiveTier: "Gallery" | "Seat" | "CornerOffice";
    syncStatus?: "ok" | "syncing" | "error";
    activeAmountWei?: string;
  }
) {
  await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
    address: VAULT,
    version: 1,
  });
  await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
    traderId: args.traderId as never,
    onChainTraderId: args.onChainTraderId,
    vaultAddress: VAULT,
    vaultVersion: 1,
    isActiveVault: true,
    effectiveTier: args.effectiveTier,
    staker: STAKER,
    activeAmountWei: args.activeAmountWei ?? SEAT_THRESHOLD_WEI,
    pendingAmountWei: "0",
    unlockTime: 0,
    syncStatus: args.syncStatus ?? "ok",
    syncError: args.syncStatus === "error" ? "rpc failed" : null,
  });
}

describe("public floor credentials (Phase 5)", () => {
  it("getPublicTraderTier exposes only display fields and fail-closes", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 1 });

    const missing = await t.query(api.seatVault.queries.getPublicTraderTier, {
      traderId: traderId as never,
    });
    expect(missing).toEqual({
      traderId,
      effectiveTier: "Gallery",
      syncStatus: "syncing",
    });
    expect(missing).not.toHaveProperty("staker");
    expect(missing).not.toHaveProperty("activeAmountWei");
    expect(missing).not.toHaveProperty("pendingAmountWei");
    expect(missing).not.toHaveProperty("unlockTime");

    await seedReconciledTier(t, {
      traderId,
      onChainTraderId: 1,
      effectiveTier: "CornerOffice",
      activeAmountWei: CORNER_OFFICE_THRESHOLD_WEI,
    });
    const ok = await t.query(api.seatVault.queries.getPublicTraderTier, {
      traderId: traderId as never,
    });
    expect(ok?.effectiveTier).toBe("CornerOffice");
    expect(ok?.syncStatus).toBe("ok");
    expect(JSON.stringify(ok)).not.toMatch(/staker|pending|unlock|0xabc/i);

    await seedReconciledTier(t, {
      traderId,
      onChainTraderId: 1,
      effectiveTier: "CornerOffice",
      syncStatus: "error",
      activeAmountWei: CORNER_OFFICE_THRESHOLD_WEI,
    });
    const erred = await t.query(api.seatVault.queries.getPublicTraderTier, {
      traderId: traderId as never,
    });
    expect(erred?.effectiveTier).toBe("Gallery");
    expect(erred?.syncStatus).toBe("error");
  });

  it("embeds effectiveTier in leaderboard, landing roster, portfolio, profile, outcomes", async () => {
    const t = makeT();
    const subject = "did:privy:cred-owner";
    const deskId = await seedDeskManager(t, {
      subject,
      walletAddress: "0x1111111111111111111111111111111111111111",
    });
    const seatTrader = await seedActiveTrader(t, deskId, {
      name: "SeatTrader",
      ownerSubject: subject,
      tokenId: 10,
    });
    const galleryTrader = await seedActiveTrader(t, deskId, {
      name: "GalleryTrader",
      ownerSubject: subject,
      tokenId: 11,
    });

    await t.run(async (ctx) => {
      for (const traderId of [seatTrader, galleryTrader]) {
        const storageId = await ctx.storage.store(
          new Blob(["p"], { type: "image/png" })
        );
        await ctx.db.patch(traderId as never, {
          imageStatus: "ready",
          profileImageStorageId: storageId,
          imagePromptSource: {
            traits: {
              expression: "cold",
              fieldInk: "vermilion",
              attire: "business",
              vice: "none",
              fieldFlourish: "plain",
            },
          },
        });
      }
    });

    await seedReconciledTier(t, {
      traderId: seatTrader,
      onChainTraderId: 10,
      effectiveTier: "Seat",
    });

    const leaderboard = await t.query(api.leaderboard.listTraderStats, {
      limit: 50,
    });
    const seatRow = leaderboard.find((r) => r.id === seatTrader);
    const galleryRow = leaderboard.find((r) => r.id === galleryTrader);
    expect(seatRow?.effectiveTier).toBe("Seat");
    expect(galleryRow?.effectiveTier).toBe("Gallery");
    expect(JSON.stringify(seatRow)).not.toMatch(
      /staker|activeAmountWei|pendingAmountWei|unlockTime/i
    );

    const roster = await t.query(api.leaderboard.listLandingRoster, {
      limit: 4,
    });
    const rosterSeat = roster.find((r) => r.id === seatTrader);
    expect(rosterSeat?.effectiveTier).toBe("Seat");
    expect(rosterSeat).not.toHaveProperty("staker");

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const portfolio = await authed.query(api.portfolio.forDesk, {});
    expect(
      portfolio.traders.find((tr) => tr.id === seatTrader)?.effectiveTier
    ).toBe("Seat");
    expect(
      portfolio.traders.find((tr) => tr.id === galleryTrader)?.effectiveTier
    ).toBe("Gallery");

    const profile = await t.query(api.traders.getPublicProfile, {
      traderId: seatTrader as never,
    });
    expect(profile?.effectiveTier).toBe("Seat");
    expect(profile?.seatSyncStatus).toBe("ok");
    expect(profile).not.toHaveProperty("staker");
    expect(profile).not.toHaveProperty("pendingAmountWei");

    const dealId = await seedDeal(t, { creatorDeskManagerId: deskId });
    await t.run(async (ctx) => {
      await ctx.db.insert("dealOutcomes", {
        dealId: dealId as never,
        traderId: seatTrader as never,
        traderPnlUsdc: 10,
        potChangeUsdc: -10,
        rakeUsdc: 0,
        narrative: "ok",
        createdAt: Date.now(),
      });
    });
    const outcomes = await authed.query(api.dealOutcomes.listByDeal, {
      dealId: dealId as never,
    });
    expect(outcomes[0]?.effectiveTier).toBe("Seat");
    expect(JSON.stringify(outcomes[0])).not.toMatch(
      /staker|pendingAmountWei|unlockTime/i
    );
  });
});
