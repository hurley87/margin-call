const PRODUCTION_ENVIRONMENTS = new Set(["production", "vercel-production"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

type SentryEvent = {
  request?: {
    url?: string | null;
  };
};

/**
 * Prefer the deployment environment tag when available and fall back to NODE_ENV.
 */
export function resolveSentryEnvironment(
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): string {
  const deploymentEnvironment = vercelEnv?.trim();
  if (deploymentEnvironment) return deploymentEnvironment;

  const runtimeEnvironment = nodeEnv?.trim();
  if (runtimeEnvironment) return runtimeEnvironment;

  return "development";
}

export function isSentryEnabled(environment = resolveSentryEnvironment()): boolean {
  return PRODUCTION_ENVIRONMENTS.has(environment.trim().toLowerCase());
}

function normalizeHostname(hostname: string): string {
  const trimmedHostname = hostname.trim().toLowerCase();

  if (
    trimmedHostname.startsWith("[") &&
    trimmedHostname.endsWith("]") &&
    trimmedHostname.length > 2
  ) {
    return trimmedHostname.slice(1, -1);
  }

  return trimmedHostname;
}

export function isLocalUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);
    const hostname = normalizeHostname(parsedUrl.hostname);
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

export function beforeSendFilter<TEvent extends SentryEvent>(
  event: TEvent,
  environment = resolveSentryEnvironment()
): TEvent | null {
  if (!isSentryEnabled(environment)) return null;
  if (isLocalUrl(event.request?.url)) return null;
  return event;
}
