"use node";

/**
 * Tweet posting behind an interface, dry-run by default.
 *
 * DryRunTweetPoster (default) records intent without posting. LiveTweetPoster
 * posts to X via the v2 `POST /2/tweets` endpoint using OAuth 1.0a user-context
 * auth (dependency-free HMAC-SHA1 signing) — enabled only when
 * MC_WIRE_TWEETS_LIVE=1 and all four credentials are set.
 *
 * Posting to X requires USER-context credentials with Read+Write permission:
 *   TWITTER_CONSUMER_KEY / TWITTER_CONSUMER_SECRET  (the app's API key/secret)
 *   TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET  (the posting account's)
 * The app-only TWITTER_BEARER_TOKEN is read-only and CANNOT create tweets.
 *
 * The game link lives in the account bio, never in tweets — posters never append
 * a URL (the sanitizer already strips/rejects them).
 */

import { createHmac, randomBytes } from "crypto";

export interface TweetRequest {
  text: string;
  /** Wire epoch slot — used for dry-run / error logs. */
  epoch?: number;
  /** Alternate log label when not a wire epoch (e.g. `deal:<id>`). */
  context?: string;
  subjectHandle?: string | null;
}

function tweetLogLabel(req: TweetRequest): string {
  if (req.context) return req.context;
  if (req.epoch != null) return `epoch ${req.epoch}`;
  return "unknown";
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
      `[wire/tweet] DRY RUN (${tweetLogLabel(req)}, ${req.text.length} chars): ${req.text}`
    );
    return { status: "dry_run" };
  }
}

// ── OAuth 1.0a signing (RFC 5849), no external deps ──────────────────────────

interface OAuthCreds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** RFC 3986 percent-encoding (encodeURIComponent + the extra reserved chars). */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function oauthHeader(method: string, url: string, creds: OAuthCreds): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  // Signature base string. For a JSON body the body is NOT part of the base
  // string — only the oauth_* params (and any query params, of which we have
  // none) are signed.
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(oauth[k])}`)
    .join("&");
  const baseString = [
    method.toUpperCase(),
    rfc3986(url),
    rfc3986(paramString),
  ].join("&");
  const signingKey = `${rfc3986(creds.consumerSecret)}&${rfc3986(
    creds.accessTokenSecret
  )}`;
  oauth.oauth_signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(oauth[k])}"`)
      .join(", ")
  );
}

function readCreds(): OAuthCreds | { error: string } {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  const missing = [
    ["TWITTER_CONSUMER_KEY", consumerKey],
    ["TWITTER_CONSUMER_SECRET", consumerSecret],
    ["TWITTER_ACCESS_TOKEN", accessToken],
    ["TWITTER_ACCESS_TOKEN_SECRET", accessTokenSecret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    return { error: `missing X credentials: ${missing.join(", ")}` };
  }
  return {
    consumerKey: consumerKey!,
    consumerSecret: consumerSecret!,
    accessToken: accessToken!,
    accessTokenSecret: accessTokenSecret!,
  };
}

/** Posts to X via v2 /2/tweets. Never throws — returns a failed result instead. */
export class LiveTweetPoster implements TweetPoster {
  async post(req: TweetRequest): Promise<TweetResult> {
    const creds = readCreds();
    if ("error" in creds) {
      console.error(`[wire/tweet] live post skipped: ${creds.error}`);
      return { status: "failed", error: creds.error };
    }
    const url = "https://api.twitter.com/2/tweets";
    try {
      const auth = oauthHeader("POST", url, creds);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: req.text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        detail?: string;
        title?: string;
      };
      if (!res.ok) {
        const err =
          `HTTP ${res.status} ${body.title ?? ""} ${body.detail ?? ""}`.trim();
        console.error(
          `[wire/tweet] live post failed (${tweetLogLabel(req)}): ${err}`
        );
        return { status: "failed", error: err };
      }
      console.log(
        `[wire/tweet] posted (${tweetLogLabel(req)}) id=${body.data?.id ?? "?"}`
      );
      return { status: "posted", id: body.data?.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[wire/tweet] live post error (${tweetLogLabel(req)}): ${msg}`
      );
      return { status: "failed", error: msg };
    }
  }
}

/**
 * Validate the CONSUMER key/secret alone (no access token) by requesting an
 * app-only bearer token (OAuth2 client_credentials). 200 => the consumer pair
 * is a valid matched pair; 401/403 => the consumer key/secret are wrong or
 * mismatched. Isolates a code-89 failure to consumer-pair vs. access-token.
 */
export async function verifyConsumerPair(): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}> {
  const key = process.env.TWITTER_CONSUMER_KEY;
  const secret = process.env.TWITTER_CONSUMER_SECRET;
  if (!key || !secret) {
    return { ok: false, error: "consumer key/secret not set" };
  }
  const basic = Buffer.from(`${rfc3986(key)}:${rfc3986(secret)}`).toString(
    "base64"
  );
  try {
    const res = await fetch("https://api.twitter.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: "grant_type=client_credentials",
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text.slice(0, 200) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getTweetPoster(): TweetPoster {
  return process.env.MC_WIRE_TWEETS_LIVE === "1"
    ? new LiveTweetPoster()
    : new DryRunTweetPoster();
}

/**
 * Read-only OAuth 1.0a credential check via v1.1 account/verify_credentials —
 * an OAuth-1.0a-supported endpoint (unlike /2/users/me, which is OAuth-2-only).
 * Surfaces raw status + body so the specific error code is visible:
 *   code 32 "Could not authenticate you" = signature / consumer-key mismatch
 *   code 89 "Invalid or expired token"   = access token bad / from another app
 *   403 / 453                            = auth OK but no v1.1 access tier
 * Never posts anything.
 */
export async function verifyCredentials(): Promise<{
  ok: boolean;
  status?: number;
  username?: string;
  body?: string;
  error?: string;
}> {
  const creds = readCreds();
  if ("error" in creds) return { ok: false, error: creds.error };
  const url = "https://api.twitter.com/1.1/account/verify_credentials.json";
  try {
    const auth = oauthHeader("GET", url, creds);
    const res = await fetch(url, { headers: { Authorization: auth } });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, body: text.slice(0, 400) };
    }
    const parsed = JSON.parse(text) as { screen_name?: string };
    return { ok: true, status: res.status, username: parsed.screen_name };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
