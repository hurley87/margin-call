import { describe, it, expect } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { makeT, seedDeskManager } from "./setup";

const FIRST_HASH = "hash-key-first-aaaa";
const SECOND_HASH = "hash-key-second-bbbb";
const THIRD_HASH = "hash-key-third-cccc";

describe("MCP key issuance — latest SIWE wins", () => {
  it("first create on a fresh desk inserts a single active key", async () => {
    const t = makeT();
    const deskId = (await seedDeskManager(t, {
      subject: "mcp:base:0xaaa",
    })) as Id<"deskManagers">;

    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: FIRST_HASH,
      deskManagerId: deskId,
    });

    const lookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: FIRST_HASH,
    });
    expect(lookup?.deskManagerId).toBe(deskId);
  });

  it("re-issuance revokes any prior non-revoked keys for the same desk", async () => {
    const t = makeT();
    const deskId = (await seedDeskManager(t, {
      subject: "mcp:base:0xbbb",
    })) as Id<"deskManagers">;

    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: FIRST_HASH,
      deskManagerId: deskId,
    });
    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: SECOND_HASH,
      deskManagerId: deskId,
    });

    const oldLookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: FIRST_HASH,
    });
    expect(oldLookup).toBeNull();

    const newLookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: SECOND_HASH,
    });
    expect(newLookup?.deskManagerId).toBe(deskId);
  });

  it("repeated re-issuance leaves exactly one active key", async () => {
    const t = makeT();
    const deskId = (await seedDeskManager(t, {
      subject: "mcp:base:0xccc",
    })) as Id<"deskManagers">;

    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: FIRST_HASH,
      deskManagerId: deskId,
    });
    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: SECOND_HASH,
      deskManagerId: deskId,
    });
    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: THIRD_HASH,
      deskManagerId: deskId,
    });

    const active = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("mcpApiKeys")
        .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskId))
        .filter((q) => q.eq(q.field("revokedAt"), undefined))
        .collect();
      return rows;
    });

    expect(active).toHaveLength(1);
    expect(active[0].keyHash).toBe(THIRD_HASH);
  });

  it("does not touch keys bound to other desks", async () => {
    const t = makeT();
    const deskA = (await seedDeskManager(t, {
      subject: "mcp:base:0xddd",
    })) as Id<"deskManagers">;
    const deskB = (await seedDeskManager(t, {
      subject: "mcp:base:0xeee",
    })) as Id<"deskManagers">;

    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: FIRST_HASH,
      deskManagerId: deskA,
    });
    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: SECOND_HASH,
      deskManagerId: deskB,
    });

    // Re-issue on deskA should NOT revoke deskB's key.
    await t.mutation(internal.mcpApiKeys.create, {
      keyHash: THIRD_HASH,
      deskManagerId: deskA,
    });

    const deskBLookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: SECOND_HASH,
    });
    expect(deskBLookup?.deskManagerId).toBe(deskB);
  });
});
