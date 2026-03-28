const PRODUCTION_NODE_ENV = "production";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Enables Sentry capture only for production runtime.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === PRODUCTION_NODE_ENV;
}

/**
 * Resolves a stable Sentry environment value from runtime context.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined,
  defaultEnvironment = "development",
): string {
  if (isSentryEnabled(nodeEnv)) {
    return PRODUCTION_NODE_ENV;
  }

  return defaultEnvironment;
}

/**
 * Drops events generated from localhost/loopback URLs.
 */
export function shouldDropSentryEvent(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const normalizedHost = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    return LOCALHOST_HOSTS.has(normalizedHost);
  } catch {
    // If we cannot parse the URL, keep the event to avoid accidental data loss.
    return false;
  }
}
