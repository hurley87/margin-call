import * as Sentry from "@sentry/nextjs";
import { shouldIgnoreDevClientError } from "./src/lib/sentry/should-ignore-client-error";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    if (shouldIgnoreDevClientError(event)) {
      return null;
    }

    return event;
  },
});
