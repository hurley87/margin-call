"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <main className="crt-scanlines grid min-h-screen place-items-center bg-[var(--t-bg)] px-5 py-8 font-mono text-[var(--t-text)]">
          <section className="w-full max-w-xl border border-[var(--t-red)]/45 bg-[#100807]/95 shadow-2xl shadow-black/60">
            <div className="border-b border-[var(--t-red)]/35 bg-[#1b0b09] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-red)]">
                Desk fault // circuit breaker
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-wide text-[var(--t-amber)]">
                Something went wrong
              </h2>
            </div>
            <div className="px-4 py-5">
              <p className="text-sm leading-6 text-[var(--t-muted)]">
                The desk hit an unrecoverable client error. Retry the panel; if
                it repeats, refresh the session before placing funded calls.
              </p>
              {error.digest ? (
                <p className="mt-4 border border-[var(--t-divider)] bg-[#070b09] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Digest {error.digest}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => reset()}
                className="mt-5 inline-flex min-h-11 items-center border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-5 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] focus:bg-[var(--t-accent)] focus:text-[var(--t-bg)] focus:outline-none"
              >
                Retry desk
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
