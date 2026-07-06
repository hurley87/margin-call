"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertOperatorSubject } from "./wire/_operatorUtils";
import { composePromptFromStored, readPublicTraits } from "./lib/portraitSeed";
import {
  type Grader,
  type GraderVerdict,
  runPortraitAttempts,
} from "./lib/portraitChecks";

// Baseline COMMON v4 mint in the locked screenprint style — only used if a
// trader somehow reaches generation without a composed prompt.
const FALLBACK_PROMPT = composePromptFromStored(
  {
    expression: "cold",
    fieldInk: "cobalt",
    attire: "business",
    vice: "none",
    fieldFlourish: "plain",
  },
  { skin: "fair", gender: "masculine", age: "40s" }
);

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

const GRADER_SYSTEM =
  "You are a STRICT visual QA grader for an NFT trait pipeline. Judge only what " +
  "is unambiguously visible. When uncertain, answer false. Reply ONLY with compact JSON.";

/**
 * Vision QA grader (gpt-4o). Ported from scratchpad/grade7.py. Returns
 * `{present:null}` on any parse/API failure after its own retries — callers
 * treat null as fail-open (the prompt exclusion block is the real guardrail;
 * a vision outage must not error the whole fleet).
 */
async function gradeImageTrait(
  client: OpenAI,
  base64: string,
  question: string
): Promise<GraderVerdict> {
  const user =
    `Question: Is it true that ${question}? ` +
    'Reply exactly: {"present": true|false, "confidence": 0.0-1.0, "note": "<=12 words"}';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.chat.completions.create(
        {
          model: "gpt-4o",
          temperature: 0,
          max_tokens: 120,
          messages: [
            { role: "system", content: GRADER_SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: user },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${base64}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
        },
        { timeout: 60_000 }
      );
      const txt = res.choices?.[0]?.message?.content ?? "";
      const start = txt.indexOf("{");
      const end = txt.lastIndexOf("}");
      if (start === -1 || end === -1) continue;
      const parsed = JSON.parse(txt.slice(start, end + 1)) as GraderVerdict;
      if (typeof parsed.present !== "boolean") {
        return { present: null, note: "unparseable verdict" };
      }
      return parsed;
    } catch {
      // fall through to retry / null
    }
  }
  return { present: null, note: "grader-error" };
}

function makeGrader(client: OpenAI): Grader {
  return (base64, question) => gradeImageTrait(client, base64, question);
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
      const traits = readPublicTraits(trader.imagePromptSource);

      const generate = async (): Promise<string> => {
        const response = await client.images.generate(
          {
            model: "gpt-image-1",
            prompt,
            size: "1024x1024",
            quality: "high",
            output_format: "png",
            n: 1,
          },
          { timeout: 120_000 }
        );
        const image = response.data?.[0]?.b64_json;
        if (!image) throw new Error("Image generation returned no image data");
        return image;
      };

      // Generate → verify flat border + rare/legendary trait visibility →
      // regenerate up to 3×. Never ships a failing tile.
      const outcome = await runPortraitAttempts({
        generate,
        grader: makeGrader(client),
        traits,
        maxAttempts: 3,
      });

      if (outcome.status === "error") {
        await ctx.runMutation(internal.traders.applyPortraitError, {
          traderId,
          error: outcome.reason,
        });
        return;
      }

      const storageId = await ctx.storage.store(
        decodeBase64Image(outcome.base64)
      );
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
