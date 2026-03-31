type Runtime = "client" | "server" | "edge";

interface ResolveSentryRuntimeConfigInput {
  runtime: Runtime;
  env: NodeJS.ProcessEnv;
}

interface SentryRuntimeConfig {
  dsn: string | undefined;
  environment: string;
  enabled: boolean;
}

function resolveEnvironment(env: NodeJS.ProcessEnv): string {
  const explicitEnvironment = env.SENTRY_ENVIRONMENT?.trim();
  if (explicitEnvironment) return explicitEnvironment;

  const vercelEnvironment = env.VERCEL_ENV?.trim();
  if (vercelEnvironment === "production") return "production";
  if (vercelEnvironment === "preview") return "preview";

  const nodeEnvironment = env.NODE_ENV?.trim();
  if (nodeEnvironment === "production") return "production";
  if (nodeEnvironment === "test") return "test";

  return "development";
}

/**
 * Normalizes runtime-specific Sentry configuration so events are consistently
 * tagged and SDK bootstrapping can be skipped when DSN is absent.
 */
export function resolveSentryRuntimeConfig({
  runtime,
  env,
}: ResolveSentryRuntimeConfigInput): SentryRuntimeConfig {
  const dsn =
    runtime === "client"
      ? env.NEXT_PUBLIC_SENTRY_DSN
      : env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    dsn,
    environment: resolveEnvironment(env),
    enabled: Boolean(dsn),
  };
}
