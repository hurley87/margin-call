type SentryRequest = {
  url?: string | null;
};

export type SentryEvent = {
  environment?: string;
  request?: SentryRequest;
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Resolve a stable environment string for Sentry tagging and filtering.
 */
export const resolveSentryEnvironment = (
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
  sentryEnvironment = process.env.SENTRY_ENVIRONMENT
): string => {
  if (sentryEnvironment?.trim()) {
    return sentryEnvironment.trim();
  }

  if (vercelEnv === "production") {
    return "vercel-production";
  }

  return nodeEnv ?? "development";
};

/**
 * Only allow telemetry emission for production-like environments.
 */
export const isSentryEnabled = (environment: string): boolean =>
  environment === "production" || environment === "vercel-production";

/**
 * Detect localhost and loopback URLs that should never be reported.
 */
export const isLocalUrl = (url?: string | null): boolean => {
  if (!url) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname.replace(/^\[(.*)\]$/, "$1");
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
};

/**
 * Drop Sentry events that are local-dev noise.
 */
export const beforeSendFilter = (
  event: SentryEvent,
  defaultEnvironment = resolveSentryEnvironment()
): SentryEvent | null => {
  const eventEnvironment = event.environment ?? defaultEnvironment;
  if (!isSentryEnabled(eventEnvironment)) {
    return null;
  }

  if (isLocalUrl(event.request?.url)) {
    return null;
  }

  return event;
};
