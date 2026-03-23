import type { Event } from "@sentry/nextjs";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Sentry should only ingest events for production builds.
 */
export function isSentryEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

function getUrlHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Drop localhost events to prevent local dev noise from polluting dashboards.
 */
export function shouldDropLocalhostEvent(event: Event): boolean {
  const requestUrl = event.request?.url;
  if (!requestUrl) {
    return false;
  }

  const hostname = getUrlHost(requestUrl);
  if (hostname && LOCALHOST_HOSTNAMES.has(hostname)) {
    return true;
  }

  return /localhost|127\.0\.0\.1|\[::1\]/i.test(requestUrl);
}
