type SentryEvent = {
  request?: {
    url?: string | null;
  } | null;
};

type ResolveEnvironmentOptions = {
  nodeEnv?: string;
  vercelEnv?: string;
  sentryEnvironment?: string;
};

const ENABLED_ENVIRONMENTS = new Set(["production", "vercel-production"]);

export function resolveSentryEnvironment(
  options: ResolveEnvironmentOptions = {}
): string {
  const configuredEnvironment = options.sentryEnvironment?.trim();
  if (configuredEnvironment) {
    return configuredEnvironment;
  }

  if (options.vercelEnv === "production") {
    return "vercel-production";
  }

  if (options.vercelEnv === "preview") {
    return "vercel-preview";
  }

  if (options.nodeEnv === "production") {
    return "production";
  }

  return "development";
}

export function isSentryEnabled(environment: string): boolean {
  return ENABLED_ENVIRONMENTS.has(environment);
}

export function isLocalUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

export function beforeSendFilter<T extends SentryEvent>(
  event: T,
  environment = resolveSentryEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT,
  })
): T | null {
  if (!isSentryEnabled(environment)) {
    return null;
  }

  if (isLocalUrl(event.request?.url)) {
    return null;
  }

  return event;
}
