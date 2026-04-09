import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig } from "@/lib/sentry-runtime-config";

const sentryConfig = resolveSentryRuntimeConfig({
  runtime: "client",
  env: process.env,
});

Sentry.init({
  dsn: sentryConfig.dsn,
  environment: sentryConfig.environment,
  enabled: sentryConfig.enabled,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});
