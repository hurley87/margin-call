import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig } from "@/lib/sentry-runtime-config";

const sentryRuntimeConfig = resolveSentryRuntimeConfig({
  runtime: "edge",
  env: process.env,
});

Sentry.init({
  dsn: sentryRuntimeConfig.dsn,
  environment: sentryRuntimeConfig.environment,
  enabled: sentryRuntimeConfig.enabled,
  tracesSampleRate: 1,
});
