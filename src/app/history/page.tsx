import { GlobalHistory } from "@/components/history/global-history";

/**
 * Global round history — attested Crash Points and honest empty/delayed/
 * expired states for the lookback window.
 */
export default function HistoryPage() {
  return (
    <div>
      <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
        Base Sepolia · Global history
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-plex-sans)] text-3xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-4xl">
        Recent rounds
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
        Finalized rounds show the attested Crash Point. Empty, delayed, and
        expired rounds never invent a multiplier.
      </p>
      <div className="mt-8">
        <GlobalHistory />
      </div>
    </div>
  );
}
