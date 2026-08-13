import { GlobalHistory } from "@/components/history/global-history";
import { RoutePageIntro } from "@/components/route-page-intro";

/**
 * Global round history — attested Crash Points and honest empty/delayed/
 * expired states for the lookback window.
 */
export default function HistoryPage() {
  return (
    <section aria-labelledby="history-heading">
      <RoutePageIntro
        eyebrow="Base Sepolia · Global history"
        title="Recent rounds"
        titleId="history-heading"
      >
        Finalized rounds show the attested Crash Point. Empty, delayed, and
        expired rounds never invent a multiplier.
      </RoutePageIntro>
      <div className="mt-8">
        <GlobalHistory />
      </div>
    </section>
  );
}
