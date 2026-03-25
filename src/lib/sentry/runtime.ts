import type { Event } from "@sentry/nextjs";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Returns true only for production runtime.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Normalizes Sentry environment names to avoid empty/missing tags.
 */
export function resolveSentryEnvironment(nodeEnv: string | undefined): string {
  if (!nodeEnv) {
    return "unknown";
  }

  return nodeEnv;
}

/**
 * Drops localhost development events to reduce non-production noise.
 */
export function filterLocalhostEvents(event: Event): Event | null {
  const eventUrl = event.request?.url;

  if (!eventUrl) {
    return event;
  }

  try {
    const parsedUrl = new URL(eventUrl);
    if (LOCALHOST_HOSTS.has(parsedUrl.hostname)) {
      return null;
    }
  } catch {
    // Keep event if URL is malformed; this avoids silently dropping valid errors.
    return event;
  }

  return event;
}
