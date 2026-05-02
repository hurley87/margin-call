import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal: fetch the content of an active system prompt by name.
 * Returns null if no active prompt with that name exists.
 * Used by cycle actions (deal resolution, etc.) to avoid coupling to Supabase.
 */
export const getActive = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const prompt = await ctx.db
      .query("systemPrompts")
      .withIndex("byName", (q) => q.eq("name", name))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    return prompt?.content ?? null;
  },
});
