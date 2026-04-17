const PRODUCTION_ENVIRONMENTS = new Set(["production", "vercel-production"]);

type SentryLikeEvent = {
  request?: {
    url?: string | null;
  };
};

const normalizeHost = (host: string) => {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }

  return host;
};

/**
 * Resolve a stable Sentry environment label from runtime env variables.
 */
export const resolveSentryEnvironment = (
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
) => {
  const normalizedVercelEnv = vercelEnv?.trim().toLowerCase();
  if (normalizedVercelEnv === "production") {
    return "vercel-production";
  }

  const normalizedNodeEnv = nodeEnv?.trim().toLowerCase();
  if (normalizedNodeEnv === "production") {
    return "production";
  }

  if (normalizedNodeEnv === "test") {
    return "development";
  }

  return normalizedNodeEnv ?? "development";
};

/**
 * Restrict Sentry transport to production environments only.
 */
export const isSentryEnabled = (environment: string) =>
  PRODUCTION_ENVIRONMENTS.has(environment);

/**
 * Detect localhost/loopback URLs to prevent development noise ingestion.
 */
export const isLocalUrl = (url: string | null | undefined) => {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const host = normalizeHost(parsed.hostname.toLowerCase());
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1"
    );
  } catch {
    return false;
  }
};

/**
 * Drop events from non-production runtime contexts and local URLs.
 */
export const beforeSendFilter = <T extends SentryLikeEvent>(
  event: T,
  environment: string,
) => {
  if (!isSentryEnabled(environment)) {
    return null;
  }

  if (isLocalUrl(event.request?.url)) {
    return null;
  }

  return event;
};
