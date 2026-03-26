type EventWithRequestUrl = {
  request?: {
    url?: string | null;
  } | null;
};

/**
 * Resolve the environment label attached to Sentry events.
 * Defaults to "development" when NODE_ENV is not set.
 */
export function resolveSentryEnvironment(nodeEnv = process.env.NODE_ENV): string {
  return nodeEnv && nodeEnv.length > 0 ? nodeEnv : "development";
}

/**
 * Enable Sentry only in production runtime.
 */
export function isSentryEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return resolveSentryEnvironment(nodeEnv) === "production";
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

/**
 * Drop localhost/loopback events to prevent local dev noise in Sentry.
 */
export function shouldDropLocalhostEvent(event: EventWithRequestUrl): boolean {
  const rawUrl = event.request?.url;
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * beforeSend-compatible filter that drops localhost events.
 */
export function filterLocalhostEvent<T extends EventWithRequestUrl>(
  event: T
): T | null {
  return shouldDropLocalhostEvent(event) ? null : event;
}
