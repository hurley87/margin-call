import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  // Suppress noisy Sentry sourcemap upload failures for pnpm vendor chunks.
  // Next.js + pnpm produces chunks named like `node_modules__pnpm_*.js` (and
  // corresponding .js.map files under chunks/ssr/ during server builds). The
  // Sentry debug ID injection + uploader frequently chokes on these with
  // `~/chunks/ssr/node_modules__pnpm_...js.map (debug id ...)` errors.
  // We don't need (and don't want) full third-party node_modules sourcemaps
  // in Sentry anyway — they bloat releases and quotas.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    ignore: [
      "node_modules/**",
      "**/node_modules/**",
      "**/chunks/ssr/node_modules**",
      "**/chunks/ssr/node_modules__pnpm**",
    ],
  },
});
