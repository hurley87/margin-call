"use client";

import { useState } from "react";
import Link from "next/link";
import { WireSourceLine } from "./wire-sources";
import { CreateDealDialog } from "./create-deal-dialog";
import type { Deal } from "@/hooks/use-deals";
import type { FeedHeadline } from "@/hooks/use-narrative";

function DealBadge({ deal }: { deal: Deal }) {
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

interface WirePostProps {
  item: FeedHeadline;
  headlineDeals?: Deal[];
  authenticated: boolean;
  balance: number | undefined;
}

export function WirePost({
  item,
  headlineDeals,
  authenticated,
  balance,
}: WirePostProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const dealCount = headlineDeals?.length ?? 0;
  const totalPot = headlineDeals?.reduce((sum, d) => sum + d.pot_usdc, 0) ?? 0;

  return (
    <div className="py-3">
      <div>
        <WireSourceLine category={item.category} createdAt={item.created_at} />

        {/* Headline */}
        <p className="mt-1 text-sm font-bold leading-snug text-[var(--t-text)]">
          {item.headline}
        </p>

        {/* Body */}
        <p className="mt-1 text-xs leading-relaxed text-[var(--t-muted)]">
          {item.body}
        </p>

        {/* Linked deals */}
        {headlineDeals && headlineDeals.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {headlineDeals.map((d) => (
              <DealBadge key={d.id} deal={d} />
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 border border-[var(--t-accent)] px-3 py-1 text-[11px] font-bold text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
          >
            $ CREATE DEAL
          </button>

          {dealCount > 0 && (
            <span className="text-[10px] text-[var(--t-muted)]">
              {dealCount} {dealCount === 1 ? "deal" : "deals"} · $
              {totalPot.toFixed(2)} pot
            </span>
          )}
        </div>
      </div>

      {dialogOpen && (
        <CreateDealDialog
          headline={item}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          authenticated={authenticated}
          balance={balance}
        />
      )}
    </div>
  );
}
