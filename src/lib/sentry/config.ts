type SentryEnvInput = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

const DEFAULT_ENVIRONMENT = "development";

function normalize(value?: string) {
  return value?.trim().toLowerCase();
}

/**
 * Derives a stable Sentry environment label from deployment/runtime variables.
 * Prefers Vercel's explicit environment when available.
 */
export function getSentryEnvironment(input: SentryEnvInput = process.env): string {
  const vercelEnv = normalize(input.VERCEL_ENV);
  if (
    vercelEnv === "production" ||
    vercelEnv === "preview" ||
    vercelEnv === "development"
  ) {
    return vercelEnv;
  }

  const nodeEnv = normalize(input.NODE_ENV);
  if (nodeEnv === "production" || nodeEnv === "test" || nodeEnv === "development") {
    return nodeEnv;
  }

  return DEFAULT_ENVIRONMENT;
}

/**
 * Enables Sentry ingestion only for true production traffic.
 * This keeps development and preview noise out of production incident queues.
 */
export function shouldEnableSentry(input: SentryEnvInput = process.env): boolean {
  return getSentryEnvironment(input) === "production";
}
