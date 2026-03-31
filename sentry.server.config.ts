import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig } from "@/lib/sentry-runtime-config";

const runtimeConfig = resolveSentryRuntimeConfig({
  runtime: "server",
  env: process.env,
});

Sentry.init({
  dsn: runtimeConfig.dsn,
  enabled: runtimeConfig.enabled,
  environment: runtimeConfig.environment,
  tracesSampleRate: 1,
});
