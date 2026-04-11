type MinimalSentryEvent = {
  request?: {
    url?: string | null;
  } | null;
};

type BeforeSendContext = {
  environment: string;
};

const PRODUCTION_ENVIRONMENTS = new Set(["production", "vercel-production"]);
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

/**
 * Resolves the explicit Sentry environment for this runtime.
 */
export function resolveSentryEnvironment(
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): string {
  if (nodeEnv !== "production") {
    return "development";
  }

  if (vercelEnv === "production") {
    return "vercel-production";
  }

  if (vercelEnv === "preview") {
    return "vercel-preview";
  }

  return "production";
}

/**
 * Enables Sentry only for production-grade environments.
 */
export function isSentryEnabled(environment: string): boolean {
  return PRODUCTION_ENVIRONMENTS.has(environment);
}

/**
 * Checks whether a URL is a loopback/local URL.
 */
export function isLocalUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return LOCAL_HOSTNAMES.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

/**
 * Drops events that are outside production or tied to localhost loopback traffic.
 */
export function beforeSendFilter<T extends MinimalSentryEvent>(
  event: T,
  context: BeforeSendContext
): T | null {
  if (!isSentryEnabled(context.environment)) {
    return null;
  }

  if (isLocalUrl(event.request?.url)) {
    return null;
  }

  return event;
}
