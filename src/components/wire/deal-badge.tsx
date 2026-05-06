import Link from "next/link";
import type { Deal } from "@/hooks/use-deals";

export function DealBadge({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/deals/${deal.id}`}
      className="flex items-center gap-2 border border-[var(--t-border)] px-2 py-1 text-[10px] transition-colors hover:bg-[var(--t-surface)]"
    >
      <span className="text-[var(--t-accent)]">
        DEAL
        {deal.on_chain_deal_id !== undefined
          ? ` #${deal.on_chain_deal_id}`
          : ""}
      </span>
      <span
        className={`font-bold ${
          deal.status === "open"
            ? "text-[var(--t-green)]"
            : "text-[var(--t-muted)]"
        }`}
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
