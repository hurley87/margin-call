"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertOperatorSubject } from "./wire/_operatorUtils";

const FALLBACK_PROMPT =
  "Create a square profile-picture portrait of one fictional 1987 Wall Street trader for a retro trading game. Painterly pixel-art inspired, cinematic 1980s financial thriller, detailed face, head-and-shoulders or upper-body composition. No readable text anywhere. No captions, no name, no nameplate, no labels, no job titles, no ticker symbols, no numbers, no letters, no logos, no watermarks, no UI text, no readable documents, no readable terminal text, no readable screen text, no modern devices, no cryptocurrency imagery, no border.";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

function decodeBase64Image(value: string): Blob {
  const bytes = Buffer.from(value, "base64");
  return new Blob([bytes], { type: "image/png" });
}

export const generateForTrader = internalAction({
  args: { traderId: v.id("traders"), force: v.optional(v.boolean()) },
  handler: async (ctx, { traderId, force }) => {
    const trader = await ctx.runMutation(
      internal.traders.markPortraitGenerating,
      {
        traderId,
        force,
      }
    );
    if (!trader) return;

    try {
      const apiKey = requireEnv("OPENAI_API_KEY");
      const prompt = trader.imagePrompt ?? FALLBACK_PROMPT;
      const client = new OpenAI({ apiKey });
      const response = await client.images.generate(
        {
          model: "gpt-image-1-mini",
          prompt,
          size: "1024x1024",
          quality: "medium",
          output_format: "png",
          n: 1,
        },
        { timeout: 90_000 }
      );

      const image = response.data?.[0]?.b64_json;
      if (!image) {
        throw new Error("Image generation returned no image data");
      }

      const storageId = await ctx.storage.store(decodeBase64Image(image));
      await ctx.runMutation(internal.traders.applyPortraitReady, {
        traderId,
        profileImageStorageId: storageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.traders.applyPortraitError, {
        traderId,
        error: message,
      });
    }
  },
});

export const adminRegenerateForTrader = action({
  args: {
    traderId: v.id("traders"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { traderId, force }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertOperatorSubject(identity.subject);

    const trader = await ctx.runQuery(internal.traders.loadInternal, {
      traderId,
    });
    if (!trader) {
      throw new Error("Trader not found");
    }

    if (
      !force &&
      trader.imageStatus === "ready" &&
      trader.profileImageStorageId
    ) {
      return { ok: true as const, status: "already_ready" as const };
    }

    await ctx.runAction(internal.portraits.generateForTrader, {
      traderId,
      force,
    });
    return { ok: true as const, status: "regenerated" as const };
  },
});

const BACKFILL_MAX_PER_RUN = 100;
const BACKFILL_MIN_STAGGER_MS = 1000;

export const adminBackfillV3 = action({
  args: { delayMsBetween: v.optional(v.number()) },
  handler: async (
    ctx,
    { delayMsBetween }
  ): Promise<{ ok: true; scheduled: number; remaining: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertOperatorSubject(identity.subject);

    const stale: Array<Id<"traders">> = await ctx.runQuery(
      internal.traders.listStaleForPortraitV3,
      {}
    );
    const stagger = Math.max(delayMsBetween ?? 4000, BACKFILL_MIN_STAGGER_MS);
    const batch = stale.slice(0, BACKFILL_MAX_PER_RUN);

    for (let i = 0; i < batch.length; i++) {
      await ctx.scheduler.runAfter(
        i * stagger,
        internal.portraits.generateForTrader,
        { traderId: batch[i], force: true }
      );
    }
    return {
      ok: true,
      scheduled: batch.length,
      remaining: Math.max(stale.length - batch.length, 0),
    };
  },
});
