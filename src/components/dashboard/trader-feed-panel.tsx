"use client";

import { useMemo, useState } from "react";

import { useActivityFeed } from "@/hooks/use-activity-feed";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { useTraders } from "@/hooks/use-traders";
import {
  FeedLine,
  buildApprovalIdByEntryId,
  buildReviewCtaEntryIds,
  getFeedGridClass,
} from "@/components/feed-line";

type TabId = "all" | "orders" | "research" | "alerts";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "all", label: "ALL" },
  { id: "orders", label: "ORDERS" },
  { id: "research", label: "RESEARCH" },
  { id: "alerts", label: "ALERTS" },
];

const TAB_TYPES: Record<TabId, ReadonlySet<string> | null> = {
  all: null,
  orders: new Set(["enter", "win", "loss", "wipeout", "evaluate", "skip"]),
  research: new Set(["scan", "evaluate", "cycle_start", "cycle_end"]),
  alerts: new Set([
    "approval_required",
    "approved",
    "rejected",
    "error",
    "pause",
    "wipeout",
  ]),
};

interface TraderFeedPanelProps {
  onReviewApproval: (ctx: { traderId: string; dealId: string | null }) => void;
}

export function TraderFeedPanel({ onReviewApproval }: TraderFeedPanelProps) {
  const { data: feedData, isLoading: feedLoading } = useActivityFeed();
  const { data: approvals } = usePendingApprovals();
  const { data: traders } = useTraders();

  const [tab, setTab] = useState<TabId>("all");
  const [traderFilter, setTraderFilter] = useState<string>("all");

  const activity = useMemo(() => feedData?.activity ?? [], [feedData]);
  const traderNames = feedData?.traderNames ?? {};

  const filtered = useMemo(() => {
    let list = activity;
    if (traderFilter !== "all") {
      const tf = traderFilter.toLowerCase();
      list = list.filter((a) => a.trader_id.toLowerCase() === tf);
    }
    const allowed = TAB_TYPES[tab];
    if (allowed) {
      list = list.filter((a) => allowed.has(a.activity_type));
    }
    return list;
  }, [activity, traderFilter, tab]);

  const approvalIdByEntryId = useMemo(
    () => buildApprovalIdByEntryId(filtered, approvals ?? []),
    [filtered, approvals]
  );

  const reviewCtaEntryIds = useMemo(
    () => buildReviewCtaEntryIds(filtered),
    [filtered]
  );

  const showTrader = traderFilter === "all";

  return (
    <section
      aria-labelledby="trader-feed-heading"
      className="panel min-h-0 flex-1"
    >
      <div className="panel-header">
        <h2 id="trader-feed-heading" className="text-[var(--t-accent)]">
          TRADER FEED
        </h2>
        <div className="flex items-center gap-2">
          {traders && traders.length > 0 && (
            <select
              value={traderFilter}
              onChange={(e) => setTraderFilter(e.target.value)}
              className="border border-[var(--t-border)] bg-[var(--t-bg)] px-1.5 py-0.5 text-[10px] tracking-wider text-[var(--t-muted)] outline-none focus:border-[var(--t-accent)]"
              aria-label="Filter feed by trader"
            >
              <option value="all">ALL TRADERS</option>
              {traders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.toUpperCase()}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center divide-x divide-[var(--t-border)] border border-[var(--t-border)]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2 py-1 text-[10px] tracking-[0.2em] transition-colors ${
                  tab === t.id
                    ? "bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div
          className={`${getFeedGridClass(showTrader)} sticky top-0 z-10 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]`}
        >
          <span>Time</span>
          <span>Type</span>
          {showTrader && <span>Trader</span>}
          <span className="min-w-0">Message</span>
          <span aria-hidden />
        </div>
        {feedLoading ? (
          <div className="p-6 text-center text-xs text-[var(--t-muted)]">
            LOADING FEED...<span className="cursor-blink">█</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--t-muted)]">
            NO ACTIVITY ON THIS DESK
          </div>
        ) : (
          <div>
            {filtered.map((entry) => (
              <FeedLine
                key={entry.id}
                entry={entry}
                traderName={traderNames[entry.trader_id] ?? "???"}
                showTrader={showTrader}
                onReviewApproval={onReviewApproval}
                reviewCtaEntryIds={reviewCtaEntryIds}
                approvalIdByEntryId={approvalIdByEntryId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
