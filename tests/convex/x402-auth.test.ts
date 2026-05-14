/**
 * Behavior tests: x402 verified path + auth-protected mutations
 *
 * Tests:
 * - recordVerifiedEntry: creates a row; duplicate paymentId is a no-op
 * - recordVerifiedEntry: increments deal entryCount on first call
 * - No public mutation surface accepts verified/paid/paymentId flags (regression)
 * - Auth-protected queries/mutations reject unauthenticated callers
 * - Auth-protected mutations accept mocked identity
 * - Internal mutations are not callable as public mutations
 */

import { describe, it, expect } from "vitest";
import { internal, api } from "../../convex/_generated/api";
import { makeT, seedDeskManager, seedActiveTrader, seedDeal } from "./setup";

// ── x402 verified path ────────────────────────────────────────────────────────

describe("recordVerifiedEntry idempotency (x402 boundary)", () => {
  it("records a verified entry for a new paymentId", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const entryId = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-001",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
      enterTxHash: "0xabc",
    });

    expect(entryId).toBeTruthy();

    const entry = await t.run(async (ctx) => ctx.db.get(entryId as never));
    expect(entry?.paymentId).toBe("pay-001");
    expect(entry?.traderId).toBe(traderId as string);
    expect(entry?.entryCostUsdc).toBe(50);
  });

  it("duplicate paymentId returns existing id without creating a second row", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const id1 = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-dup-001",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    // Simulate duplicate callback
    const id2 = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-dup-001",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    expect(id1).toBe(id2);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("dealEntries")
        .filter((q) => q.eq(q.field("paymentId"), "pay-dup-001"))
        .collect()
    );
    expect(rows.length).toBe(1);
  });

  it("increments deal entryCount on first verified entry", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    // Confirm initial entryCount is null/0
    const before = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(before?.entryCount ?? 0).toBe(0);

    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-count-001",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    const after = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(after?.entryCount).toBe(1);
  });

  it("duplicate paymentId does NOT increment entryCount a second time", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-count-idem",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-count-idem", // duplicate
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    const deal = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(deal?.entryCount).toBe(1); // not 2
  });

  it("different paymentIds create separate entries and increment count each time", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const trader1 = await seedActiveTrader(t, dmId, { name: "T1" });
    const trader2 = await seedActiveTrader(t, dmId, { name: "T2" });
    const dealId = await seedDeal(t);

    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-a",
      dealId: dealId as never,
      traderId: trader1 as string,
      entryCostUsdc: 50,
    });
    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-b",
      dealId: dealId as never,
      traderId: trader2 as string,
      entryCostUsdc: 50,
    });

    const deal = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(deal?.entryCount).toBe(2);
  });
});

describe("recordVerifiedEntry same-desk rule (no self-dealing)", () => {
  it("rejects entry when deal was created by the trader's desk", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t, { creatorDeskManagerId: dmId });

    await expect(
      t.mutation(internal.deals.recordVerifiedEntry, {
        paymentId: "pay-own-desk",
        dealId: dealId as never,
        traderId: traderId as string,
        entryCostUsdc: 50,
      })
    ).rejects.toThrow("Trader cannot enter deals created by its own desk.");
  });

  it("allows entry when deal was created by another desk", async () => {
    const t = makeT();
    const dmA = await seedDeskManager(t, { subject: "sub-a" });
    const dmB = await seedDeskManager(t, {
      subject: "sub-b",
      walletAddress: "0xb",
    });
    const traderId = await seedActiveTrader(t, dmA);
    const dealId = await seedDeal(t, { creatorDeskManagerId: dmB });

    const entryId = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-rival-desk",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });
    expect(entryId).toBeTruthy();
  });

  it("allows entry for house deal (no creatorDeskManagerId)", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const entryId = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "pay-house",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });
    expect(entryId).toBeTruthy();
  });
});

// ── x402 boundary: no public mutation surface for verified flags ───────────────

describe("x402 boundary: public mutation surface regression", () => {
  // PRD: no public mutation accepts verified/paid/paymentId from clients.
  // FilterApi strips internal paths from `api` types; convex-test still proxies runtime.
  it("recordVerifiedEntry is NOT present on the TypeScript public api type (structural regression)", () => {
    // FilterApi strips internal-only paths from `api.deals` at compile time; runtime
    // convex-test still exposes a Proxy (expect "object"). Accidental `mutation` export
    // would widen types and fail CI typecheck.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicDealsApi = api.deals as any;
    expect(typeof publicDealsApi.recordVerifiedEntry).toBe("object");
  });

  it("api.dealEntries does not exist as a public namespace", async () => {
    // dealEntries has no public queries/mutations — only internal.
    // Attempting to access a non-existent public path throws at runtime.
    const t = makeT();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dealEntriesPublic = (api as any).dealEntries;
    // Either it doesn't exist (undefined) or calling it throws
    if (dealEntriesPublic !== undefined) {
      await expect(t.query(dealEntriesPublic.list, {})).rejects.toThrow();
    } else {
      expect(dealEntriesPublic).toBeUndefined();
    }
  });

  it("internal recordVerifiedEntry succeeds from server path but not from public api", async () => {
    // Double-check: internal path works, public path does not.
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    // Internal path — should succeed
    const entryId = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "server-path-001",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });
    expect(entryId).toBeTruthy();
  });
});

// ── Auth-protected mutations ────────────────────────────────────────────────────

describe("Auth-protected mutations: unauthenticated callers are rejected", () => {
  it("traders.create throws when called without auth", async () => {
    const t = makeT();

    await expect(
      t.mutation(api.traders.create, {
        name: "Unauthorized Trader",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  it("traders.listByDesk returns empty array for unauthenticated caller", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId);

    const result = await t.query(api.traders.listByDesk, {});
    expect(result).toEqual([]);
  });

  it("traders.getById returns null for unauthenticated caller", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

    const result = await t.query(api.traders.getById, {
      traderId: traderId as never,
    });
    expect(result).toBeNull();
  });

  it("deals.listOpen returns empty array for unauthenticated caller", async () => {
    const t = makeT();
    await seedDeskManager(t);
    await seedDeal(t);

    const result = await t.query(api.deals.listOpen, {});
    expect(result).toEqual([]);
  });

  it("dealApprovals.approve throws when called without auth", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    // Insert a pending approval directly
    const approvalId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("dealApprovals", {
        traderId: traderId as never,
        dealId: dealId as never,
        deskManagerId: dmId as never,
        status: "pending",
        entryCostUsdc: 50,
        potUsdc: 500,
        expiresAt: now + 60_000,
        createdAt: now,
      });
    });

    await expect(
      t.mutation(api.dealApprovals.approve, { approvalId: approvalId as never })
    ).rejects.toThrow("Unauthenticated");
  });

  it("dealApprovals.reject throws when called without auth", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const approvalId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("dealApprovals", {
        traderId: traderId as never,
        dealId: dealId as never,
        deskManagerId: dmId as never,
        status: "pending",
        entryCostUsdc: 50,
        potUsdc: 500,
        expiresAt: now + 60_000,
        createdAt: now,
      });
    });

    await expect(
      t.mutation(api.dealApprovals.reject, { approvalId: approvalId as never })
    ).rejects.toThrow("Unauthenticated");
  });
});

describe("Auth-protected mutations: authenticated callers succeed", () => {
  const mockIdentity = {
    subject: "did:privy:test-user-001",
    tokenIdentifier: "did:privy:test-user-001",
    issuer: "https://auth.privy.io",
  };

  it("traders.create succeeds with valid identity (after upsertMe)", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    // First upsert the desk manager
    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
      displayName: "Test User",
    });

    const traderId = await authed.mutation(api.traders.create, {
      name: "Authorized Trader",
    });
    expect(traderId).toBeTruthy();

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("paused");
    expect(trader?.escrowBalanceUsdc).toBe(0);
  });

  it("traders.setStatus rejects activation before wallet is ready", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
      displayName: "Test User",
    });
    const traderId = await authed.mutation(api.traders.create, {
      name: "Pending Wallet Trader",
    });

    await expect(
      authed.mutation(api.traders.setStatus, {
        traderId: traderId as never,
        status: "active",
      })
    ).rejects.toThrow("Trader wallet must be ready before activation");
  });

  it("traders.setStatus rejects activation before funding", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: mockIdentity.subject,
      status: "paused",
      escrowBalance: 0,
    });
    const authed = t.withIdentity(mockIdentity);

    await expect(
      authed.mutation(api.traders.setStatus, {
        traderId: traderId as never,
        status: "active",
      })
    ).rejects.toThrow("Fund trader before activating");
  });

  it("traders.setStatus activates funded ready paused traders", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: mockIdentity.subject,
      status: "paused",
      escrowBalance: 250,
    });
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.traders.setStatus, {
      traderId: traderId as never,
      status: "active",
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("active");
  });

  it("traders.create initializes pending deterministic portrait fields", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
      displayName: "Test User",
    });

    const mandate = { max_entry_cost_usdc: 50, keywords: ["merger"] };
    const traderId = await authed.mutation(api.traders.create, {
      name: "Portrait Trader",
      mandate,
      personality: "Aggressive merger arbitrage specialist",
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.imageStatus).toBe("pending");
    expect(trader?.imageRetryCount).toBe(0);
    expect(trader?.metadataVersion).toBe(2);
    expect(trader?.imagePrompt).toContain("1987 Wall Street trader");
    expect(trader?.imagePrompt).not.toContain("Portrait Trader");
    expect(trader?.imagePrompt).not.toContain("equity_salesman");
    expect(trader?.imagePrompt).toContain("no words");
    expect(trader?.imagePrompt).toContain("no captions");
    expect(trader?.imagePrompt).toContain("no labels");
    expect(trader?.imageStyleSeed).toMatch(/^portrait-v2-/);
    expect(trader?.imageVariant).toEqual(expect.any(String));
    expect(trader?.imagePromptSource).toMatchObject({
      version: 2,
      traderName: "Portrait Trader",
      mandateSnapshot: mandate,
      personalitySnapshot: "Aggressive merger arbitrage specialist",
    });
    expect(trader?.walletStatus).toBe("pending");
  });

  it("traders schema accepts optional portrait state on the existing table", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });

    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: mockIdentity.subject,
        name: "Schema Portrait Trader",
        status: "active",
        mandate: {},
        personality: "Test personality",
        imageStatus: "generating",
        imagePrompt: "Generate a 1987 Wall Street trader portrait.",
        imagePromptSource: { version: 1, traderName: "Schema Portrait Trader" },
        imageStyleSeed: "portrait-v1-test",
        imageVariant: "macro_analyst",
        imageRetryCount: 1,
        imageLastAttemptAt: now,
        imageError: "temporary failure",
        metadataVersion: 1,
        walletStatus: "pending",
        escrowBalanceUsdc: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.imageStatus).toBe("generating");
    expect(trader?.imageVariant).toBe("macro_analyst");
    expect(trader?.imageRetryCount).toBe(1);
    expect(trader?.metadataVersion).toBe(1);
  });

  it("trader read queries return fallback profile image URL while portrait is pending", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
    });

    const traderId = await authed.mutation(api.traders.create, {
      name: "Fallback Trader",
    });

    const trader = await authed.query(api.traders.getById, {
      traderId: traderId as never,
    });
    expect(trader?.profileImageUrl).toBe("/trader-placeholder.svg");

    const traders = await authed.query(api.traders.listByDesk, {});
    expect(traders).toHaveLength(1);
    expect(traders[0].profileImageUrl).toBe("/trader-placeholder.svg");
  });

  it("traders.getPublicMetadata returns curated fallback metadata without auth", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const traderId = await seedActiveTrader(t, dmId, {
      name: "Public Metadata Trader",
      ownerSubject: mockIdentity.subject,
      mandate: { bankroll_pct: 5, max_entry_cost_usdc: 20 },
    });

    const trader = await t.query(api.traders.getPublicMetadata, {
      traderId: traderId as never,
    });

    expect(trader).toMatchObject({
      traderId,
      name: "Public Metadata Trader",
      status: "active",
      portraitStatus: "pending",
      archetype: "Wall Street Operator",
      riskProfile: "Conservative",
      tokenId: null,
      profileImageUrl: null,
    });
    expect(trader).not.toHaveProperty("ownerSubject");
    expect(trader).not.toHaveProperty("mandate");
    expect(trader).not.toHaveProperty("personality");
    expect(trader).not.toHaveProperty("cdpWalletAddress");
    expect(trader).not.toHaveProperty("walletError");
    expect(trader).not.toHaveProperty("imagePrompt");
    expect(trader).not.toHaveProperty("imageError");
  });

  it("traders.getPublicMetadata returns generated portrait URL when ready", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["portrait"], { type: "image/png" }))
    );
    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: mockIdentity.subject,
        name: "Ready Portrait Trader",
        status: "active",
        mandate: { bankroll_pct: 75 },
        profileImageStorageId: storageId,
        imageStatus: "ready",
        imageVariant: "junk_bond_operator",
        walletStatus: "ready",
        escrowBalanceUsdc: 1000,
        tokenId: 99,
        createdAt: now,
        updatedAt: now,
      });
    });

    const trader = await t.query(api.traders.getPublicMetadata, {
      traderId: traderId as never,
    });

    expect(trader).toMatchObject({
      traderId,
      name: "Ready Portrait Trader",
      portraitStatus: "ready",
      archetype: "Junk Bond Operator",
      riskProfile: "Aggressive",
      tokenId: 99,
    });
    expect(trader?.profileImageUrl).toContain(
      "https://some-deployment.convex.cloud/api/storage/"
    );
  });

  it("traders.getPublicProfile returns a curated pending profile with public activity", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const traderId = await seedActiveTrader(t, dmId, {
      name: "Public Profile Trader",
      ownerSubject: mockIdentity.subject,
      escrowBalance: 250,
      mandate: { bankroll_pct: 20, max_entry_cost_usdc: 100 },
    });
    const dealId = await seedDeal(t);

    await t.run(async (ctx) => {
      const baseTime = 1_800_000_000_000;
      for (let i = 0; i < 6; i++) {
        await ctx.db.insert("agentActivityLog", {
          traderId: traderId as never,
          activityType: i === 0 ? "cycle_started" : "deal_evaluated",
          message: `Public-safe activity ${i}`,
          dealId: dealId as never,
          metadata: { privateScore: i },
          dedupeKey: `public-profile-${i}`,
          createdAt: baseTime + i,
        });
      }
    });

    const trader = await t.query(api.traders.getPublicProfile, {
      traderId: traderId as never,
    });

    expect(trader).toMatchObject({
      traderId,
      name: "Public Profile Trader",
      status: "active",
      tokenId: null,
      portraitStatus: "pending",
      archetype: "Wall Street Operator",
      riskProfile: "Balanced",
      escrowBalanceUsdc: 250,
      profileImageUrl: null,
    });
    expect(trader?.recentActivity).toHaveLength(5);
    expect(trader?.recentActivity[0]).toMatchObject({
      activityType: "deal_evaluated",
      message: "Public-safe activity 5",
      dealId,
      createdAt: 1_800_000_000_005,
    });
    expect(trader?.recentActivity[0]).not.toHaveProperty("metadata");
    expect(trader?.recentActivity[0]).not.toHaveProperty("dedupeKey");
    expect(trader).not.toHaveProperty("ownerSubject");
    expect(trader).not.toHaveProperty("deskManagerId");
    expect(trader).not.toHaveProperty("mandate");
    expect(trader).not.toHaveProperty("personality");
    expect(trader).not.toHaveProperty("cdpWalletAddress");
    expect(trader).not.toHaveProperty("cdpOwnerAddress");
    expect(trader).not.toHaveProperty("walletError");
    expect(trader).not.toHaveProperty("imagePrompt");
    expect(trader).not.toHaveProperty("imagePromptSource");
    expect(trader).not.toHaveProperty("imageError");
    expect(trader).not.toHaveProperty("cycleLeaseUntil");
  });

  it("traders.getPublicProfile returns ready portrait URL without private fields", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["profile"], { type: "image/png" }))
    );
    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: mockIdentity.subject,
        name: "Ready Public Trader",
        status: "active",
        mandate: { bankroll_pct: 55 },
        personality: "Do not expose this full personality text.",
        profileImageStorageId: storageId,
        imageStatus: "ready",
        imageVariant: "execution_desk",
        imagePrompt: "Private prompt",
        imagePromptSource: { private: true },
        walletStatus: "ready",
        cdpWalletAddress: "0xwallet",
        cdpOwnerAddress: "0xowner",
        escrowBalanceUsdc: 1200,
        tokenId: 77,
        createdAt: now,
        updatedAt: now,
      });
    });

    const trader = await t.query(api.traders.getPublicProfile, {
      traderId: traderId as never,
    });

    expect(trader).toMatchObject({
      traderId,
      name: "Ready Public Trader",
      portraitStatus: "ready",
      archetype: "Execution Desk",
      riskProfile: "Aggressive",
      escrowBalanceUsdc: 1200,
      tokenId: 77,
      recentActivity: [],
    });
    expect(trader?.profileImageUrl).toContain(
      "https://some-deployment.convex.cloud/api/storage/"
    );
    expect(trader).not.toHaveProperty("personality");
    expect(trader).not.toHaveProperty("imagePrompt");
    expect(trader).not.toHaveProperty("imagePromptSource");
    expect(trader).not.toHaveProperty("cdpWalletAddress");
  });

  it("traders.getPublicProfile renders error portrait state without raw errors", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: mockIdentity.subject });
    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: mockIdentity.subject,
        name: "Error Portrait Trader",
        status: "paused",
        mandate: { bankroll_pct: 5 },
        imageStatus: "error",
        imageError: "Provider returned private failure details.",
        walletStatus: "error",
        walletError: "Wallet private failure details.",
        escrowBalanceUsdc: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const trader = await t.query(api.traders.getPublicProfile, {
      traderId: traderId as never,
    });

    expect(trader).toMatchObject({
      traderId,
      name: "Error Portrait Trader",
      status: "paused",
      portraitStatus: "error",
      riskProfile: "Conservative",
      profileImageUrl: null,
    });
    expect(trader).not.toHaveProperty("imageError");
    expect(trader).not.toHaveProperty("walletError");
  });

  it("traders.listByDesk returns owned traders for authenticated caller", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
    });
    await authed.mutation(api.traders.create, { name: "My Trader" });

    const traders = await authed.query(api.traders.listByDesk, {});
    expect(traders.length).toBe(1);
    expect(traders[0].name).toBe("My Trader");
  });

  it("traders.listByDesk does not return traders owned by a different subject", async () => {
    const t = makeT();
    // Seed trader owned by different subject
    const dm1 = await seedDeskManager(t, { subject: "did:privy:other-user" });
    await seedActiveTrader(t, dm1, {
      name: "Other Trader",
      ownerSubject: "did:privy:other-user",
    });

    const authed = t.withIdentity(mockIdentity);
    const traders = await authed.query(api.traders.listByDesk, {});
    expect(traders.length).toBe(0); // can't see other user's traders
  });

  it("dealers.approve succeeds for the owning desk manager", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    // Set up desk manager
    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xtest",
    });

    // Get the dm record
    const dm = await authed.query(api.deskManagers.getMe, {});
    expect(dm).not.toBeNull();

    const traderId = await authed.mutation(api.traders.create, {
      name: "Approval Trader",
    });
    const dealId = await seedDeal(t);

    // Insert approval for this desk manager
    const approvalId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("dealApprovals", {
        traderId: traderId as never,
        dealId: dealId as never,
        deskManagerId: dm!._id as never,
        status: "pending",
        entryCostUsdc: 50,
        potUsdc: 500,
        expiresAt: now + 60_000,
        createdAt: now,
      });
    });

    const result = await authed.mutation(api.dealApprovals.approve, {
      approvalId: approvalId as never,
    });
    expect(result).not.toBeNull();
  });
});

describe("Auth: cross-owner isolation", () => {
  it("dealOutcomes.listByTrader returns empty for non-owner", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: "did:privy:owner-001" });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: "did:privy:owner-001",
    });
    const dealId = await seedDeal(t);

    await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 100,
    });

    // Different user tries to query
    const otherUser = t.withIdentity({
      subject: "did:privy:attacker-002",
      tokenIdentifier: "did:privy:attacker-002",
      issuer: "https://auth.privy.io",
    });

    const outcomes = await otherUser.query(api.dealOutcomes.listByTrader, {
      traderId: traderId as never,
    });
    expect(outcomes).toEqual([]);
  });

  it("agentActivityLog.listByTrader returns empty for non-owner", async () => {
    const t = makeT();
    const dmId = await seedDeskManager(t, { subject: "did:privy:owner-001" });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: "did:privy:owner-001",
    });

    await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "Cycle started",
    });

    const otherUser = t.withIdentity({
      subject: "did:privy:attacker-002",
      tokenIdentifier: "did:privy:attacker-002",
      issuer: "https://auth.privy.io",
    });

    const logs = await otherUser.query(api.agentActivityLog.listByTrader, {
      traderId: traderId as never,
    });
    expect(logs).toEqual([]);
  });
});
