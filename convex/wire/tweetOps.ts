"use node";

/**
 * Operator helpers for wiring up X posting. Run before enabling the cron:
 *
 *   # 1. Confirm the four user-context credentials are valid (READ ONLY, no post)
 *   npx convex run wire/tweetOps:verifyTwitter '{}'
 *
 *   # 2. Post ONE real test tweet to confirm write access (requires confirm)
 *   npx convex run wire/tweetOps:postTestTweet '{"confirm":true}'
 *
 * Once both pass, set MC_WIRE_TWEETS_LIVE=1 in the Convex env and each published
 * wire drop will post its (sanitized, URL-free) tweet variant automatically.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  LiveTweetPoster,
  verifyCredentials,
  verifyConsumerPair,
} from "./tweetPoster";

export const verifyTwitter = internalAction({
  args: {},
  handler: async () => {
    const consumer = await verifyConsumerPair();
    const full = await verifyCredentials();
    console.log(
      `[wire/tweetOps] consumer key/secret valid: ${consumer.ok ? "YES" : `NO (status ${consumer.status ?? "?"})`}`
    );
    if (full.ok) {
      console.log(
        `[wire/tweetOps] full credentials OK — posting as @${full.username}`
      );
    } else {
      console.error(
        `[wire/tweetOps] access-token check failed: status=${full.status ?? "?"} ${full.error ?? ""} ${full.body ?? ""}`
      );
    }
    return {
      consumerPairValid: consumer.ok,
      accessTokenValid: full.ok,
      username: full.username,
      diagnosis: consumer.ok
        ? full.ok
          ? "all four valid"
          : "consumer key/secret OK — the ACCESS TOKEN/SECRET are wrong or from a different app"
        : "the CONSUMER KEY/SECRET are wrong or mismatched",
    };
  },
});

export const postTestTweet = internalAction({
  args: { text: v.optional(v.string()), confirm: v.optional(v.boolean()) },
  handler: async (_ctx, { text, confirm }) => {
    if (!confirm) {
      return {
        posted: false,
        note: "Pass confirm:true to actually post. This will publish a real tweet.",
      };
    }
    const poster = new LiveTweetPoster();
    const result = await poster.post({
      text:
        text ??
        "Test transmission from the wire desk. The interns insisted. Please disregard.",
      epoch: 0,
    });
    return result;
  },
});
