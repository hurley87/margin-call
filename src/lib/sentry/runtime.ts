const LOCAL_SENTRY_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

const LOCAL_SENTRY_URL_PATTERN =
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)\b/i;

/**
 * Enables Sentry only for production runtime.
 */
export function isSentryEnabled(
  nodeEnv: string | undefined | null,
): nodeEnv is "production" {
  return nodeEnv === "production";
}

/**
 * Normalizes environment labels to keep non-production signals separated.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined | null,
  fallbackEnvironment: string | undefined | null,
): string {
  if (isSentryEnabled(nodeEnv)) {
    return fallbackEnvironment?.trim() || "production";
  }

  return nodeEnv?.trim() || "development";
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

/**
 * Drops localhost/loopback events that are almost always local-dev noise.
 */
export function shouldDropSentryEvent(
  requestUrl: string | undefined | null,
): boolean {
  if (!requestUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(requestUrl);
    const hostname = normalizeHostname(parsedUrl.hostname);
    return LOCAL_SENTRY_HOSTS.has(hostname) || hostname.endsWith(".local");
  } catch {
    return LOCAL_SENTRY_URL_PATTERN.test(requestUrl);
  }
}
