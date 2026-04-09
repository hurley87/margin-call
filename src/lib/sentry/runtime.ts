type SentryEvent = {
  request?: { url?: string | null } | null;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function getHostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function isLocalhostHost(hostname: string | null): boolean {
  if (!hostname) return false;
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  return hostname.endsWith(".localhost");
}

/**
 * Restrict event capture to true production builds.
 * Prevents local/dev runtime noise from being shipped to Sentry.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Keep environment tagging deterministic to make Sentry filtering reliable.
 */
export function resolveSentryEnvironment({
  nodeEnv,
  vercelEnv,
  explicitEnvironment,
}: {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  explicitEnvironment: string | undefined;
}): string {
  if (explicitEnvironment) return explicitEnvironment;
  if (vercelEnv) return vercelEnv;
  return nodeEnv ?? "development";
}

/**
 * Drop localhost/loopback browser events to avoid development-only noise.
 */
export function filterLocalhostEvent<T extends SentryEvent>(event: T): T | null {
  const eventHost = getHostFromUrl(event.request?.url);
  return isLocalhostHost(eventHost) ? null : event;
}
