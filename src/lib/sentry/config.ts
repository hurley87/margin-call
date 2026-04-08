const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

type EnvMap = Record<string, string | undefined>;

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalizedValue = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalizedValue)) return true;
  if (FALSE_VALUES.has(normalizedValue)) return false;
  return undefined;
}

/**
 * Computes the environment name sent to Sentry.
 */
export function getSentryEnvironment(env: EnvMap = process.env): string {
  return (
    env.SENTRY_ENVIRONMENT ??
    env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    env.VERCEL_ENV ??
    env.NODE_ENV ??
    "development"
  );
}

/**
 * Sentry is enabled only in production by default.
 * Override with SENTRY_ENABLED/NEXT_PUBLIC_SENTRY_ENABLED.
 */
export function shouldEnableSentry(env: EnvMap = process.env): boolean {
  const explicitEnabled = parseOptionalBoolean(
    env.SENTRY_ENABLED ?? env.NEXT_PUBLIC_SENTRY_ENABLED
  );
  if (explicitEnabled !== undefined) return explicitEnabled;
  return getSentryEnvironment(env) === "production";
}
