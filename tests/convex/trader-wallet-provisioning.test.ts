import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
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

  it("retryWalletProvisioning clears walletStep checkpoint fields", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Step Reset",
      status: "paused",
      walletStatus: "error",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(traderId as Id<"traders">, {
        walletStep: "id_minted",
        walletStepTokenId: 7,
        updatedAt: Date.now(),
      });
    });

    await asDeskManager(t).mutation(api.traders.retryWalletProvisioning, {
      traderId: traderId as Id<"traders">,
    });

    const trader = await asDeskManager(t).query(api.traders.getById, {
      traderId: traderId as Id<"traders">,
    });
    expect(trader?.walletStep).toBeUndefined();
    expect(trader?.walletStepTokenId).toBeUndefined();
  });
});

describe("wallet provisioning checkpoints", () => {
  it("markCreating records the paperwork step and clears a stale tokenId", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Checkpoint Trader",
      status: "paused",
      walletStatus: "pending",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(traderId as Id<"traders">, { walletStepTokenId: 99 });
    });

    const updatedAt = await t.run(async (ctx) => {
      const trader = await ctx.db.get(traderId as Id<"traders">);
      return trader!.updatedAt;
    });

    const acquired = await t.mutation(internal.traders.markCreating, {
      traderId: traderId as Id<"traders">,
      expectedUpdatedAt: updatedAt,
    });
    expect(acquired).toBe(true);

    const trader = await t.run(async (ctx) =>
      ctx.db.get(traderId as Id<"traders">)
    );
    expect(trader?.walletStatus).toBe("creating");
    expect(trader?.walletStep).toBe("paperwork");
    expect(trader?.walletStepTokenId).toBeUndefined();
  });

  it("setWalletStep records the step and tokenId while creating", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Mid Pipeline",
      status: "paused",
      walletStatus: "creating",
    });

    await t.mutation(internal.traders.setWalletStep, {
      traderId: traderId as Id<"traders">,
      step: "id_minted",
      tokenId: 128,
    });

    const trader = await t.run(async (ctx) =>
      ctx.db.get(traderId as Id<"traders">)
    );
    expect(trader?.walletStep).toBe("id_minted");
    expect(trader?.walletStepTokenId).toBe(128);
  });

  it("setWalletStep is a no-op when the wallet is not creating", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Already Ready",
      walletStatus: "ready",
    });

    await t.mutation(internal.traders.setWalletStep, {
      traderId: traderId as Id<"traders">,
      step: "seat_registered",
    });

    const trader = await t.run(async (ctx) =>
      ctx.db.get(traderId as Id<"traders">)
    );
    expect(trader?.walletStep).toBeUndefined();
  });

  it("getById read model exposes walletStep and walletStepTokenId", async () => {
    const t = makeT();
    const deskManagerId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskManagerId, {
      name: "Read Model",
      status: "paused",
      walletStatus: "creating",
    });

    await t.mutation(internal.traders.setWalletStep, {
      traderId: traderId as Id<"traders">,
      step: "seat_registered",
      tokenId: 55,
    });

    const trader = await asDeskManager(t).query(api.traders.getById, {
      traderId: traderId as Id<"traders">,
    });
    expect(trader?.walletStep).toBe("seat_registered");
    expect(trader?.walletStepTokenId).toBe(55);
  });
});
