"use node";

/**
 * Deal-creation X posts — scheduled when a deal is first recorded in Convex.
 * Reuses getTweetPoster / sanitizeTweet / MC_WIRE_TWEETS_LIVE. Does not touch
 * the hourly wire-epoch tweet path.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { sanitizeTweet } from "./tweetVariant";
import { getTweetPoster } from "./tweetPoster";
import {
  buildDealTweetText,
  resolveSubjectFromNarrative,
} from "./dealTweetText";

/**
 * Post (or dry-run) an X status when a deal is newly created.
 * Idempotent: skips if tweetStatus is already set.
 */
export const postDealCreated = internalAction({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }): Promise<{ status: string }> => {
    const loaded = await ctx.runQuery(
      internal.wire.dealTweetStore.loadDealTweetContext,
      { dealId }
    );
    if (!loaded) {
      console.warn(`[wire/dealTweet] deal ${dealId} not found`);
      return { status: "skipped" };
    }
    if (loaded.tweetStatus) {
      return { status: loaded.tweetStatus };
    }

    const subject = resolveSubjectFromNarrative(loaded.narrative);
    const raw = buildDealTweetText({
      prompt: loaded.prompt,
      potUsdc: loaded.potUsdc,
      entryCostUsdc: loaded.entryCostUsdc,
    });
    const sanitized = sanitizeTweet(raw, {
      subjectSymbol: subject.subjectSymbol,
      subjectHandle: subject.subjectHandle,
    });

    let tweetStatus: string;
    const tweetVariant: string | undefined = sanitized.text;

    if (!sanitized.ok) {
      tweetStatus = "skipped";
      console.warn(
        `[wire/dealTweet] tweet skipped (deal ${dealId}): ${sanitized.issues.join(", ")}`
      );
    } else {
      const poster = getTweetPoster();
      const result = await poster.post({
        text: sanitized.text,
        context: `deal:${dealId}`,
        subjectHandle: subject.subjectHandle,
      });
      tweetStatus = result.status;
      if (result.status === "failed") {
        console.error(
          `[wire/dealTweet] post failed (deal ${dealId}): ${result.error ?? "?"}`
        );
      }
    }

    await ctx.runMutation(internal.wire.dealTweetStore.recordDealTweetStatus, {
      dealId: dealId as Id<"deals">,
      tweetStatus,
      tweetVariant,
    });

    return { status: tweetStatus };
  },
});
