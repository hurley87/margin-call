import { internalQuery, internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { systemPromptSeeds } from "./seeds/systemPrompts";

async function fetchActivePrompt(
  db: QueryCtx["db"],
  name: string
): Promise<string | null> {
  const prompt = await db
    .query("systemPrompts")
    .withIndex("byName", (q) => q.eq("name", name))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();
  return prompt?.content ?? null;
}

/** Internal: fetch active system prompt content by name. Used by Convex actions. */
export const getActive = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => fetchActivePrompt(ctx.db, name),
});

/**
 * Public variant — used by Next.js API routes via `fetchQuery` (no admin auth).
 * Prompt content is non-sensitive (sent verbatim to OpenAI), so a public read is fine.
 */
export const getActiveByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => fetchActivePrompt(ctx.db, name),
});

/** Idempotent seed for the systemPrompts table. Run via: npx convex run systemPrompts:seed */
export const seed = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const entry of systemPromptSeeds) {
      const existing = await ctx.db
        .query("systemPrompts")
        .withIndex("byName", (q) => q.eq("name", entry.name))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: entry.content,
          returnFormat: entry.returnFormat,
          isActive: true,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("systemPrompts", {
          name: entry.name,
          content: entry.content,
          returnFormat: entry.returnFormat,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
