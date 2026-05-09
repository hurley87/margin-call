"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertOperatorSubject } from "./wire/_operatorUtils";

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
      const prompt =
        trader.imagePrompt ??
        `Create a square profile picture of a fictional 1987 Wall Street trader named ${trader.name}. No text, no logos.`;
      const client = new OpenAI({ apiKey });
      const response = await client.images.generate(
        {
          model: "gpt-image-1-mini",
          prompt,
          size: "1024x1024",
          quality: "low",
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
