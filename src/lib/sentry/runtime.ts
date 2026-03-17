type EnvironmentVariables = Partial<Record<string, string | undefined>>;

const PRODUCTION_ENV = "production";
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

interface EventLike {
  request?: {
    url?: string | null;
  };
  tags?: Record<string, unknown>;
}

function getTaggedUrl(event: EventLike): string | null {
  const taggedUrl = event.tags?.url;
  return typeof taggedUrl === "string" ? taggedUrl : null;
}

export function resolveSentryEnvironment(
  env: EnvironmentVariables = process.env
): string {
  return (
    env.NEXT_PUBLIC_SENTRY_ENV ??
    env.SENTRY_ENVIRONMENT ??
    env.VERCEL_ENV ??
    env.NODE_ENV ??
    "development"
  );
}

export function isSentryEnabled(
  env: EnvironmentVariables = process.env
): boolean {
  const hasDsn = Boolean(env.NEXT_PUBLIC_SENTRY_DSN);
  return hasDsn && resolveSentryEnvironment(env) === PRODUCTION_ENV;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    return LOCALHOST_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function shouldDropClientEvent(event: EventLike): boolean {
  const eventUrl = event.request?.url ?? getTaggedUrl(event);
  if (!eventUrl) return false;
  return isLocalhostUrl(eventUrl);
}
