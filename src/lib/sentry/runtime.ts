type SentryEventLike = {
  request?: {
    url?: string | null;
  } | null;
  tags?: Record<string, unknown> | null;
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Enable Sentry only for production runtime traffic.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Keep Sentry environments stable and explicit across runtimes.
 */
export function resolveSentryEnvironment(nodeEnv: string | undefined): string {
  if (nodeEnv === "production") {
    return "production";
  }

  if (nodeEnv === "test") {
    return "test";
  }

  return "development";
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const normalizedHostname = parsedUrl.hostname.replace(/^\[(.*)\]$/, "$1");
    return LOCALHOST_HOSTNAMES.has(normalizedHostname);
  } catch {
    return false;
  }
}

function getEventUrl(event: SentryEventLike): string | null {
  if (typeof event.request?.url === "string") {
    return event.request.url;
  }

  const tagUrl = event.tags?.url;
  return typeof tagUrl === "string" ? tagUrl : null;
}

/**
 * Ignore localhost events to avoid polluting production triage with local dev noise.
 */
export function shouldDropSentryEvent(event: SentryEventLike): boolean {
  const eventUrl = getEventUrl(event);
  if (!eventUrl) {
    return false;
  }

  return isLocalhostUrl(eventUrl);
}
