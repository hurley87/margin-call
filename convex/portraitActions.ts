"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const OPENAI_IMAGE_MODEL = "gpt-image-1";
const OPENAI_IMAGE_SIZE = "1024x1024";
const OPENAI_IMAGE_QUALITY = "medium";
const OPENAI_IMAGE_FORMAT = "png";

type PortraitGenerationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing"
        | "ready"
        | "max_attempts"
        | "in_flight"
        | "missing_prompt"
        | "generation_failed";
    };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

function toInternalError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.slice(0, 500);
  }
  return String(err).slice(0, 500);
}

function buildGenerationPrompt(input: {
  imagePrompt: string;
  imagePromptSource?: unknown;
  imageStyleSeed?: string;
  imageVariant?: string;
}): string {
  const source =
    input.imagePromptSource === undefined
      ? "unavailable"
      : JSON.stringify(input.imagePromptSource).slice(0, 1200);

  return [
    input.imagePrompt,
    `Image variant: ${input.imageVariant ?? "default_wall_street_operator"}.`,
    `Style seed: ${input.imageStyleSeed ?? "portrait-v1-default"}.`,
    `Snapshotted trader source data: ${source}.`,
  ].join("\n");
}

async function generateOpenAIImage(prompt: string): Promise<Blob> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
      output_format: OPENAI_IMAGE_FORMAT,
      n: 1,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenAI image generation failed: ${response.status} ${body.slice(0, 300)}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const imageBase64 = payload.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("OpenAI image generation returned no image data");
  }

  const bytes = Buffer.from(imageBase64, "base64");
  return new Blob([bytes], { type: "image/png" });
}

/**
 * Internal action: generate one trader portrait, store it in Convex Storage,
 * and only mark the trader ready after storage succeeds.
 */
export const generateForTrader = internalAction({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }): Promise<PortraitGenerationResult> => {
    const markResult = await ctx.runMutation(
      internal.portraits.markGenerating,
      {
        traderId,
      }
    );
    if (!markResult.ok) return markResult;

    const input = await ctx.runQuery(internal.portraits.loadGenerationInput, {
      traderId,
    });
    if (!input?.imagePrompt) {
      await ctx.runMutation(internal.portraits.applyGenerationFailure, {
        traderId,
        error: "Missing portrait generation prompt",
      });
      return { ok: false as const, reason: "missing_prompt" as const };
    }

    try {
      const blob = await generateOpenAIImage(
        buildGenerationPrompt({
          imagePrompt: input.imagePrompt,
          imagePromptSource: input.imagePromptSource,
          imageStyleSeed: input.imageStyleSeed,
          imageVariant: input.imageVariant,
        })
      );
      const profileImageStorageId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.portraits.applyGeneratedImage, {
        traderId,
        profileImageStorageId,
      });
      return { ok: true as const };
    } catch (err) {
      const failure = await ctx.runMutation(
        internal.portraits.applyGenerationFailure,
        {
          traderId,
          error: toInternalError(err),
        }
      );
      if (failure.shouldRetry && failure.retryDelayMs !== null) {
        await ctx.scheduler.runAfter(
          failure.retryDelayMs,
          internal.portraitActions.generateForTrader,
          { traderId }
        );
      }
      return { ok: false as const, reason: "generation_failed" as const };
    }
  },
});
