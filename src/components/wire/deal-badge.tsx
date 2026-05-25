import Link from "next/link";
import type { Deal } from "@/hooks/use-deals";
import { cn } from "@/lib/utils";

export function DealBadge({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/?deal=${encodeURIComponent(deal.id)}`}
      className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border border-[var(--t-border)] px-2 py-1 text-[10px] transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-surface)] focus:border-[var(--t-accent)] focus:bg-[var(--t-surface)] focus:outline-none"
    >
      <span className="text-[var(--t-accent)]">
        DEAL
        {deal.on_chain_deal_id !== undefined
          ? ` #${deal.on_chain_deal_id}`
          : ""}
      </span>
      <span
        className={cn(
          "font-bold",
          deal.status === "open"
            ? "text-[var(--t-green)]"
            : "text-[var(--t-muted)]"
        )}
      >
        [{deal.status.toUpperCase()}]
      </span>
      <span className="text-[var(--t-muted)]">
        ${deal.pot_usdc.toFixed(2)} pot
      </span>
      <span className="text-[var(--t-muted)]">{deal.entry_count} entries</span>
    </Link>
  );
}
