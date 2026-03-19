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

const LOCALHOST_URL_PATTERN =
  /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/|$)/i;

const SCHEMELESS_LOCALHOST_PATTERN =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/|$)/i;

const NON_PRODUCTION_ENVIRONMENTS = new Set(["development", "dev", "local"]);

function isLocalhostUrl(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return false;

  return (
    LOCALHOST_URL_PATTERN.test(normalizedValue) ||
    SCHEMELESS_LOCALHOST_PATTERN.test(normalizedValue)
  );
}

function getEventTag(tags: Record<string, unknown> | null | undefined, key: string) {
  const rawValue = tags?.[key];
  return typeof rawValue === "string" ? rawValue : null;
}

/**
 * Enables Sentry only for production runtime with a DSN configured.
 *
 * In Vercel environments, this further limits ingestion to `VERCEL_ENV=production`
 * so preview deployments don't pollute production issue streams.
 */
export function shouldEnableSentryRuntime({
  dsn,
  nodeEnv,
  vercelEnv,
}: RuntimeConfig) {
  if (!dsn) return false;
  if (nodeEnv !== "production") return false;
  if (!vercelEnv) return true;

  return vercelEnv === "production";
}

/**
 * Drops local-development events as a defense-in-depth safeguard.
 * This protects Sentry dashboards from localhost noise if SDK enablement
 * is overridden by environment misconfiguration.
 */
export function shouldDropLocalSentryEvent(event: SentryEventLike) {
  const environment = event.environment?.toLowerCase();
  if (environment && NON_PRODUCTION_ENVIRONMENTS.has(environment)) {
    return true;
  }

  const requestUrl = event.request?.url;
  if (typeof requestUrl === "string" && isLocalhostUrl(requestUrl)) {
    return true;
  }

  const tagUrl = getEventTag(event.tags, "url");
  if (tagUrl && isLocalhostUrl(tagUrl)) {
    return true;
  }

  const transaction = event.transaction;
  if (typeof transaction === "string" && isLocalhostUrl(transaction)) {
    return true;
  }

  return false;
}
