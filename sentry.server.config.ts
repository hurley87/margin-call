import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "@/lib/telemetry/privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ...sentryPrivacyOptions,
});
