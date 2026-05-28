import { describe, it, expect } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { makeT, seedDeskManager } from "./setup";

const ISSUER = "did:privy:issuer-001";
const OUTSIDER = "did:privy:outsider-001";
const OLD_HASH = "hash-old-key-aaaa";
const NEW_HASH = "hash-new-key-bbbb";

async function seedKey(
  t: ReturnType<typeof makeT>,
  deskManagerId: Id<"deskManagers">,
  keyHash: string,
  issuedBy: string
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("mcpApiKeys", {
      keyHash,
      deskManagerId,
      issuedByPrivySubject: issuedBy,
      createdAt: Date.now(),
    });
  });
}

describe("MCP key rotation + revocation", () => {
  it("revoke marks the key revokedAt and lookup returns null for it", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t, { subject: "mcp:cdp-wallet:zz" });
    const keyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    const before = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: OLD_HASH,
    });
    expect(before?.deskManagerId).toBe(deskId);

    const res = await t.mutation(internal.mcpApiKeys.revoke, {
      keyId,
      revokedByPrivySubject: ISSUER,
    });
    expect(res.ok).toBe(true);
    expect(res.alreadyRevoked).toBe(false);

    const after = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: OLD_HASH,
    });
    expect(after).toBeNull();
  });

  it("revoke is idempotent — second call reports alreadyRevoked", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const keyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    const first = await t.mutation(internal.mcpApiKeys.revoke, {
      keyId,
      revokedByPrivySubject: ISSUER,
    });
    expect(first.alreadyRevoked).toBe(false);

    const second = await t.mutation(internal.mcpApiKeys.revoke, {
      keyId,
      revokedByPrivySubject: ISSUER,
    });
    expect(second.alreadyRevoked).toBe(true);
    expect(second.revokedAt).toBe(first.revokedAt);
  });

  it("revoke from a non-issuer subject is rejected", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const keyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    await expect(
      t.mutation(internal.mcpApiKeys.revoke, {
        keyId,
        revokedByPrivySubject: OUTSIDER,
      })
    ).rejects.toThrow(/Not authorized/);
  });

  it("rotate atomically revokes old key and binds new key to the same desk", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const oldKeyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    const res = await t.mutation(internal.mcpApiKeys.rotate, {
      keyId: oldKeyId,
      newKeyHash: NEW_HASH,
      rotatedByPrivySubject: ISSUER,
    });
    expect(res.ok).toBe(true);
    expect(res.deskManagerId).toBe(deskId);

    // Old hash → null (revoked).
    const oldLookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: OLD_HASH,
    });
    expect(oldLookup).toBeNull();

    // New hash → same desk.
    const newLookup = await t.query(internal.mcpApiKeys.lookupDeskByKeyHash, {
      keyHash: NEW_HASH,
    });
    expect(newLookup?.deskManagerId).toBe(deskId);
  });

  it("rotate from a non-issuer subject is rejected", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const keyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    await expect(
      t.mutation(internal.mcpApiKeys.rotate, {
        keyId,
        newKeyHash: NEW_HASH,
        rotatedByPrivySubject: OUTSIDER,
      })
    ).rejects.toThrow(/Not authorized/);
  });

  it("rotate against an already-revoked key is rejected", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const keyId = await seedKey(
      t,
      deskId as Id<"deskManagers">,
      OLD_HASH,
      ISSUER
    );

    await t.mutation(internal.mcpApiKeys.revoke, {
      keyId,
      revokedByPrivySubject: ISSUER,
    });

    await expect(
      t.mutation(internal.mcpApiKeys.rotate, {
        keyId,
        newKeyHash: NEW_HASH,
        rotatedByPrivySubject: ISSUER,
      })
    ).rejects.toThrow(/already-revoked/);
  });
});
