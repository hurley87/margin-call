type SentryEventLike = {
  request?: {
    url?: string | null;
  };
  tags?: Record<string, string>;
};

const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

/**
 * Resolve the Sentry environment with explicit override precedence.
 * This keeps client/server/edge config behavior aligned.
 */
export function getSentryEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.SENTRY_ENVIRONMENT ??
    env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    env.VERCEL_ENV ??
    env.NODE_ENV ??
    "development"
  );
}

export function isSentryEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    Boolean(env.NEXT_PUBLIC_SENTRY_DSN) && getSentryEnvironment(env) === "production"
  );
}

export function shouldDropSentryEvent(
  event: SentryEventLike,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isSentryEnabled(env)) return true;

  const eventEnvironment = event.tags?.environment;
  if (eventEnvironment && eventEnvironment !== "production") return true;

  const url = event.request?.url?.toLowerCase();
  if (!url) return false;

  return LOCALHOST_HOSTNAMES.some((hostname) => url.includes(hostname));
}
