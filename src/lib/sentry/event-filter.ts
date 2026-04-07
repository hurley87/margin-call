type RuntimeEnvironmentVars = {
  SENTRY_ENVIRONMENT?: string;
  NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  NODE_ENV?: string;
};

type EventTags = Record<string, string | undefined>;

export type MinimalSentryEvent = {
  environment?: string;
  request?: {
    url?: string;
  };
  tags?: EventTags;
};

const PRODUCTION_ENVIRONMENTS = new Set(["production", "prod", "vercel-production"]);

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "::1",
  "0:0:0:0:0:0:0:1",
  "127.0.0.1",
  "0.0.0.0",
  "::ffff:127.0.0.1",
]);

export function normalizeRuntimeEnvironment(
  value: string | undefined | null
): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isProductionRuntimeEnvironment(
  value: string | undefined | null
): boolean {
  const normalized = normalizeRuntimeEnvironment(value);
  return normalized !== null && PRODUCTION_ENVIRONMENTS.has(normalized);
}

export function resolveRuntimeEnvironment(
  vars: RuntimeEnvironmentVars = process.env
): string | null {
  return (
    normalizeRuntimeEnvironment(vars.SENTRY_ENVIRONMENT) ??
    normalizeRuntimeEnvironment(vars.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ??
    normalizeRuntimeEnvironment(vars.VERCEL_ENV) ??
    normalizeRuntimeEnvironment(vars.NEXT_PUBLIC_VERCEL_ENV) ??
    normalizeRuntimeEnvironment(vars.NODE_ENV)
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized.endsWith(".localhost")) return true;
  if (normalized.startsWith("127.")) return true;
  return LOOPBACK_HOSTNAMES.has(normalized);
}

function extractHostname(urlValue: string): string | null {
  try {
    return new URL(urlValue).hostname;
  } catch {
    return null;
  }
}

function getEventUrlCandidates(event: MinimalSentryEvent): string[] {
  const tags = event.tags ?? {};
  return [event.request?.url, tags.url, tags.request_url].filter(
    (value): value is string => Boolean(value && value.trim().length > 0)
  );
}

function hasLoopbackEventUrl(event: MinimalSentryEvent): boolean {
  for (const urlValue of getEventUrlCandidates(event)) {
    const hostname = extractHostname(urlValue);
    if (!hostname) continue;
    if (isLoopbackHostname(hostname)) return true;
  }

  return false;
}

function eventEnvironmentIsNonProduction(event: MinimalSentryEvent): boolean {
  const eventEnvironment = normalizeRuntimeEnvironment(
    event.environment ?? event.tags?.environment
  );

  if (!eventEnvironment) return false;
  return !isProductionRuntimeEnvironment(eventEnvironment);
}

export function shouldDropSentryEvent(
  event: MinimalSentryEvent,
  runtimeEnvironment: string | undefined | null
): boolean {
  if (!isProductionRuntimeEnvironment(runtimeEnvironment)) return true;
  if (eventEnvironmentIsNonProduction(event)) return true;
  if (hasLoopbackEventUrl(event)) return true;
  return false;
}
