import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { makeT, seedDeskManager, seedActiveTrader } from "./setup";
import { TRADER_NAME_TAKEN_MESSAGE } from "../../convex/traders";

function asDeskManager(t: ReturnType<typeof makeT>) {
  return t.withIdentity({
    subject: "did:privy:test-subject-001",
    issuer: "test",
  });
}

function asOtherDeskManager(t: ReturnType<typeof makeT>) {
  return t.withIdentity({
    subject: "did:privy:test-subject-002",
    issuer: "test",
  });
}

describe("trader wallet provisioning recovery", () => {
  it("rejects trader creation until the desk wallet is funded", async () => {
    const t = makeT();
    await seedDeskManager(t, { walletBalance: 0 });

    await expect(
      asDeskManager(t).mutation(api.traders.create, {
        name: "NoCash",
        mandate: {},
      })
    ).rejects.toThrow("Fund your wallet before hiring a trader");
  });

  it("re-hire with same name returns existing trader instead of creating duplicate", async () => {
    const t = makeT();
    await seedDeskManager(t);

    const firstTraderId = await asDeskManager(t).mutation(api.traders.create, {
      name: "Lilly",
      mandate: {},
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(firstTraderId as Id<"traders">, {
        walletStatus: "error",
        walletError: "CDP API timeout",
        updatedAt: Date.now(),
      });
    });

    const secondTraderId = await asDeskManager(t).mutation(api.traders.create, {
      name: "Lilly",
      mandate: {},
    });

    expect(secondTraderId).toBe(firstTraderId);

    const rows = await asDeskManager(t).query(api.traders.listByDesk, {});
    expect(rows).toHaveLength(1);
  });

  it("rejects duplicate trader names across desks (case-insensitive)", async () => {
    const t = makeT();
    await seedDeskManager(t, { subject: "did:privy:test-subject-001" });
    await seedDeskManager(t, {
      subject: "did:privy:test-subject-002",
      walletAddress: "0xdef456",
    });

    await asDeskManager(t).mutation(api.traders.create, {
      name: "Lilly",
      mandate: {},
    });

    await expect(
      asOtherDeskManager(t).mutation(api.traders.create, {
        name: "lIlLy",
        mandate: {},
      })
    ).rejects.toThrow(TRADER_NAME_TAKEN_MESSAGE);
  });

  it("retryWalletProvisioning clears walletError and sets status to pending", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Retry Trader",
      status: "paused",
      walletStatus: "error",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(traderId as Id<"traders">, {
        walletError: "Failed to extract tokenId from mint transaction",
        updatedAt: Date.now(),
      });
    });

    const result = await asDeskManager(t).mutation(
      api.traders.retryWalletProvisioning,
      {
        traderId: traderId as Id<"traders">,
      }
    );
    expect(result).toEqual({ ok: true, status: "scheduled" });

    const trader = await asDeskManager(t).query(api.traders.getById, {
      traderId: traderId as Id<"traders">,
    });
    expect(trader?.walletStatus).toBe("pending");
    expect(trader?.walletError).toBeUndefined();
  });
});
