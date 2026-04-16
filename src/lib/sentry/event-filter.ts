import type { Event } from "@sentry/nextjs";

const PRODUCTION_ENVIRONMENTS = new Set(["production", "vercel-production"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Resolve a stable Sentry environment across local, preview, and production runtimes.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): string {
  if (vercelEnv === "production") {
    return "vercel-production";
  }

  if (nodeEnv === "test") {
    return "development";
  }

  if (nodeEnv && nodeEnv.length > 0) {
    return nodeEnv;
  }

  return "development";
}

/**
 * Restrict event delivery to production-like environments.
 */
export function isSentryEnabled(environment: string): boolean {
  return PRODUCTION_ENVIRONMENTS.has(environment);
}

/**
 * Detect local URLs, including bracketed IPv6 loopback.
 */
export function isLocalUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const normalizedHostname = parsedUrl.hostname
      .replace(/^\[/, "")
      .replace(/\]$/, "");
    return LOCAL_HOSTNAMES.has(normalizedHostname);
  } catch {
    return false;
  }
}

/**
 * Drop non-production and localhost/loopback events to reduce noisy ingestion.
 */
export function beforeSendFilter(event: Event, defaultEnvironment: string): Event | null {
  const eventEnvironment = event.environment ?? defaultEnvironment;
  if (!isSentryEnabled(eventEnvironment)) {
    return null;
  }

  if (isLocalUrl(event.request?.url)) {
    return null;
  }

  return event;
}
