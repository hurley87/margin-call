/**
 * Tweet posting behind an interface, dry-run by default. v1 never posts: the
 * wire generates and stores the sanitized tweet variant, and DryRunTweetPoster
 * logs it. A LiveTweetPoster is stubbed for when credentials + a client are
 * wired (gated by MC_WIRE_TWEETS_LIVE=1). The game link lives in the account
 * bio, never in tweets — so posters never append URLs.
 */

export interface TweetRequest {
  text: string;
  epoch: number;
  subjectHandle?: string | null;
}

export interface TweetResult {
  status: "dry_run" | "posted" | "skipped" | "failed";
  id?: string;
  error?: string;
}

export interface TweetPoster {
  post(req: TweetRequest): Promise<TweetResult>;
}

/** Default poster: records intent without posting. */
export class DryRunTweetPoster implements TweetPoster {
  async post(req: TweetRequest): Promise<TweetResult> {
    console.log(
      `[wire/tweet] DRY RUN (epoch ${req.epoch}, ${req.text.length} chars): ${req.text}`
    );
    return { status: "dry_run" };
  }
}

/** Stub for real posting — intentionally not implemented in v1. */
export class LiveTweetPoster implements TweetPoster {
  async post(req: TweetRequest): Promise<TweetResult> {
    console.warn(
      `[wire/tweet] live posting requested (epoch ${req.epoch}) but no client is wired`
    );
    return { status: "failed", error: "live tweet posting not implemented" };
  }
}

export function getTweetPoster(): TweetPoster {
  return process.env.MC_WIRE_TWEETS_LIVE === "1"
    ? new LiveTweetPoster()
    : new DryRunTweetPoster();
}
