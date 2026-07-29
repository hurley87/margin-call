import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Auth-shell schema after agent-game teardown (#298).
 * Game tables return with the NAV-rip rebuild (#297).
 */
export default defineSchema({
  siwaNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("byNonce", ["nonce"])
    .index("byExpiresAt", ["expiresAt"]),
});
