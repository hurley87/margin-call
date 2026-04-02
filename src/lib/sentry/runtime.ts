interface SentryRuntimeEnv {
  nodeEnv?: string | null;
  vercelEnv?: string | null;
  sentryDsn?: string | null;
}

/**
 * We only emit events from production runtime:
 * - On Vercel: VERCEL_ENV must be "production" (preview is excluded)
 * - Off Vercel: NODE_ENV must be "production"
 */
export function isSentryEnabled(env: SentryRuntimeEnv): boolean {
  if (!env.sentryDsn) return false;

  if (env.vercelEnv) {
    return env.vercelEnv === "production";
  }

  return env.nodeEnv === "production";
}

export function getSentryEnvironment({
  nodeEnv,
  vercelEnv,
}: Pick<SentryRuntimeEnv, "nodeEnv" | "vercelEnv">): string {
  if (vercelEnv) return vercelEnv;
  if (nodeEnv) return nodeEnv;
  return "development";
}

export function isLocalUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl);
    return isLocalhostHost(url.hostname);
  } catch {
    return false;
  }
}

function isLocalhostHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
