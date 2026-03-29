const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Enable Sentry only in production runtime environments.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Resolve Sentry environment tags consistently across runtimes.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined,
  fallbackEnvironment: string | undefined
): string {
  if (nodeEnv === "production") {
    return fallbackEnvironment?.trim() || "production";
  }

  if (nodeEnv === "test") {
    return "test";
  }

  return "development";
}

/**
 * Drop events that clearly originate from localhost/loopback URLs.
 */
export function shouldDropSentryEvent(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const { hostname } = new URL(url);
    const normalizedHostname = hostname.replace(/^\[(.*)\]$/, "$1");
    return (
      LOCALHOST_HOSTNAMES.has(normalizedHostname) ||
      normalizedHostname.endsWith(".localhost") ||
      normalizedHostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}
