/**
 * Tweet-variant sanitizer — pure, unit-testable. Enforces the platform + house
 * rules in CODE (not just the prompt):
 *   - NO URLs (link posts are billed higher and deprioritized) — stripped, and
 *     if a bare domain survives the tweet is rejected rather than mangled.
 *   - ≤ 280 characters.
 *   - the covered company's @handle is present when it is the story's subject
 *     (the distribution mechanic).
 * Cashtags ($SYMBOL) are allowed and preserved.
 */

export const TWEET_MAX_CHARS = 280;

// URLs with an explicit scheme or www. prefix.
const URL_SCHEME_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// A bare domain like "foo.com" / "bar.xyz" — used to REJECT (not strip) so we
// never post a half-mangled link. Excludes cashtags/handles (no dot there).
const BARE_DOMAIN_RE =
  /\b[a-z0-9-]+\.(?:com|io|xyz|net|org|gg|app|co|fi|ai|eth|dev|gov|edu|me|info|link|fun|finance|money|fund|markets)\b/i;

export interface SanitizeResult {
  text: string;
  ok: boolean;
  issues: string[];
}

function hasHandle(text: string, handle: string): boolean {
  return text.toLowerCase().includes(handle.toLowerCase());
}

/**
 * Sanitize a raw generated tweet. `subjectHandle` is the covered company's
 * @handle when a company is the story's subject (else undefined).
 */
export function sanitizeTweet(
  raw: string,
  opts: { subjectHandle?: string | null } = {}
): SanitizeResult {
  const issues: string[] = [];
  let text = (raw ?? "").replace(/\s+/g, " ").trim();

  // Strip explicit URLs.
  if (URL_SCHEME_RE.test(text)) {
    issues.push("stripped_url");
    text = text
      .replace(URL_SCHEME_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Any surviving bare domain → reject (do not post a mangled link).
  if (BARE_DOMAIN_RE.test(text)) {
    issues.push("url");
    return { text, ok: false, issues };
  }

  // Strip EVERY model-written @-mention — the model must not invent or tag any
  // account. The only allowed @-mention is the covered company's registry
  // handle, appended below. (Cashtags use $ and are preserved.)
  const stripped = text
    .replace(/@\w{1,15}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (stripped !== text) issues.push("stripped_mention");
  text = stripped;

  // Ensure the subject company's handle is present (distribution mechanic).
  const handle = opts.subjectHandle?.trim();
  if (handle && handle.startsWith("@") && !hasHandle(text, handle)) {
    const candidate = `${text} ${handle}`.trim();
    if (candidate.length <= TWEET_MAX_CHARS) {
      text = candidate;
    } else {
      issues.push("missing_handle");
    }
  }

  // Length cap. Trim to a word boundary and add an ellipsis.
  if (text.length > TWEET_MAX_CHARS) {
    issues.push("truncated");
    const slice = text.slice(0, TWEET_MAX_CHARS - 1);
    const lastSpace = slice.lastIndexOf(" ");
    text = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + "…";
  }

  const ok = !issues.includes("url") && !issues.includes("missing_handle");
  return { text, ok, issues };
}

/** True if the text contains any URL or bare domain (for validation/tests). */
export function containsUrl(text: string): boolean {
  URL_SCHEME_RE.lastIndex = 0;
  return URL_SCHEME_RE.test(text) || BARE_DOMAIN_RE.test(text);
}
