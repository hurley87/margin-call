type RuntimeConfig = {
  dsn?: string | null;
  nodeEnv?: string | null;
  vercelEnv?: string | null;
};

type SentryEventLike = {
  environment?: string;
  transaction?: string | null;
  request?: {
    url?: string | null;
  } | null;
  tags?: Record<string, unknown> | null;
};

const LOCAL_SENTRY_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

const LOCAL_SENTRY_URL_PATTERN =
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)\b/i;

const NON_PRODUCTION_ENVIRONMENTS = new Set([
  "development",
  "dev",
  "local",
  "test",
  "preview",
]);

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

function isLocalSentryUrl(rawUrl: string): boolean {
  const normalizedInput = rawUrl.trim();
  if (!normalizedInput) return false;

  try {
    const parsedUrl = new URL(normalizedInput);
    const hostname = normalizeHostname(parsedUrl.hostname);
    return LOCAL_SENTRY_HOSTS.has(hostname) || hostname.endsWith(".local");
  } catch {
    return LOCAL_SENTRY_URL_PATTERN.test(normalizedInput);
  }
}

function getEventTag(tags: Record<string, unknown> | null | undefined, key: string) {
  const rawValue = tags?.[key];
  return typeof rawValue === "string" ? rawValue : null;
}

/**
 * Enables Sentry only for production runtime with a configured DSN.
 * If Vercel environment is known, only the `production` deployment is allowed.
 */
export function isSentryEnabled({
  dsn,
  nodeEnv,
  vercelEnv,
}: RuntimeConfig): boolean {
  if (!dsn) return false;
  if (normalizeValue(nodeEnv) !== "production") return false;

  const normalizedVercelEnv = normalizeValue(vercelEnv);
  if (!normalizedVercelEnv) return true;

  return normalizedVercelEnv === "production";
}

/**
 * Resolves a stable environment tag for Sentry events.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined | null,
  fallbackEnvironment: string | undefined | null,
): string {
  const normalizedNodeEnv = normalizeValue(nodeEnv);
  const trimmedFallback = fallbackEnvironment?.trim();

  if (normalizedNodeEnv === "production") {
    return trimmedFallback || "production";
  }

  if (normalizedNodeEnv) {
    return normalizedNodeEnv;
  }

  return trimmedFallback || "development";
}

/**
 * Drops local-development and non-production events as defense in depth.
 */
export function shouldDropSentryEvent(event: SentryEventLike): boolean {
  const environment = normalizeValue(event.environment);
  if (environment && NON_PRODUCTION_ENVIRONMENTS.has(environment)) {
    return true;
  }

  const requestUrl = event.request?.url;
  if (typeof requestUrl === "string" && isLocalSentryUrl(requestUrl)) {
    return true;
  }

  const tagUrl = getEventTag(event.tags, "url");
  if (tagUrl && isLocalSentryUrl(tagUrl)) {
    return true;
  }

  const transaction = event.transaction;
  if (typeof transaction === "string" && isLocalSentryUrl(transaction)) {
    return true;
  }

  return false;
}
