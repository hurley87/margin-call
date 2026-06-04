"use client";

import { useMemo, useState } from "react";
import {
  FeedLine,
  buildApprovalIdByEntryId,
  buildReviewCtaEntryIds,
  getFeedGridClass,
} from "@/components/feed-line";
import { ActivityDetailDialog } from "@/components/activity-detail-dialog";
import { DealApprovalDialog } from "@/components/deal-approval-dialog";
import { DealDetailDialog } from "@/components/deal-detail";
import { EmptyState } from "@/components/empty-state";
import { useAgentActivity, type AgentActivity } from "@/hooks/use-agent";
import { usePendingApprovals } from "@/hooks/use-approvals";

interface TraderActivityPanelProps {
  traderId: string;
}

const ACTIVITY_PAGE_SIZE = 10;

export function TraderActivityPanel({ traderId }: TraderActivityPanelProps) {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [approvalCtx, setApprovalCtx] = useState<{
    traderId: string;
    dealId: string | null;
  } | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<AgentActivity | null>(null);
  const {
    data: activity,
    isLoading,
    isError,
    error,
  } = useAgentActivity(traderId);
  const { data: pendingApprovals } = usePendingApprovals();
  const approvalIdByEntryId = useMemo(() => {
    return buildApprovalIdByEntryId(
      activity ?? [],
      pendingApprovals ?? [],
      traderId
    );
  }, [activity, pendingApprovals, traderId]);
  const reviewCtaEntryIds = useMemo(
    () => buildReviewCtaEntryIds(activity ?? []),
    [activity]
  );
  const totalCount = activity?.length ?? 0;
  const visibleActivity = activity?.slice(0, visibleCount) ?? [];
  const hasMore = visibleCount < totalCount;
  const canShowLess = visibleCount > ACTIVITY_PAGE_SIZE;

  return (
    <section className="min-w-0">
      <div className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide text-[var(--t-amber)]">
              Live activity
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
              Newest calls, approvals, and deal outcomes print first.
            </p>
          </div>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--t-accent)]">
            {totalCount > ACTIVITY_PAGE_SIZE
              ? `${visibleActivity.length}/${totalCount} Events`
              : `${totalCount} Events`}
          </span>
        </div>
      </div>

      <div
        className={`${getFeedGridClass(false)} border-y border-[var(--t-border)]/80 py-2 text-xs uppercase tracking-wider text-[var(--t-muted)]`}
      >
        <span>Time</span>
        <span>Type</span>
        <span className="min-w-0">Message</span>
        <span aria-hidden />
      </div>

      {isLoading ? (
        <div className="border border-[var(--t-divider)] bg-[#070b09] px-4 py-6 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--t-muted)]">
            Reading trader tape
            <span className="cursor-blink ml-1 text-[var(--t-accent)]">█</span>
          </p>
        </div>
      ) : isError ? (
        <div className="border border-[var(--t-red)]/35 bg-[var(--t-red)]/[0.06] px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--t-red)]">
            {error instanceof Error
              ? error.message
              : "Failed to load trader activity."}
          </p>
        </div>
      ) : !activity || activity.length === 0 ? (
        <EmptyState
          title="No realtime activity yet"
          description="When this trader scans the wire, asks for approval, or settles a deal, the tape will print here."
          className="border border-[var(--t-divider)] bg-[#070b09]/75"
        />
      ) : (
        <>
          <div className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100svh-12rem)]">
            {visibleActivity.map((entry) => (
              <FeedLine
                key={entry.id}
                entry={entry}
                traderName=""
                showTrader={false}
                wrapMessage
                onOpenDeal={setSelectedDealId}
                onShowDetail={setDetailEntry}
                onReviewApproval={(ctx) => setApprovalCtx(ctx)}
                reviewCtaEntryIds={reviewCtaEntryIds}
                approvalIdByEntryId={approvalIdByEntryId}
              />
            ))}
          </div>
          {(hasMore || canShowLess) && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--t-border)]/80 pt-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                Showing newest first
              </p>
              <div className="flex items-center gap-2">
                {canShowLess && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(ACTIVITY_PAGE_SIZE)}
                    className="min-h-10 border border-[var(--t-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
                  >
                    Show Latest 10
                  </button>
                )}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)
                    }
                    className="min-h-10 border border-[var(--t-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)] focus:border-[var(--t-accent)] focus:text-[var(--t-text)] focus:outline-none"
                  >
                    Load 10 More
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <DealApprovalDialog
        open={approvalCtx !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalCtx(null);
        }}
        traderId={approvalCtx?.traderId ?? traderId}
        dealId={approvalCtx?.dealId ?? null}
      />
      <DealDetailDialog
        dealId={selectedDealId}
        open={selectedDealId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDealId(null);
        }}
      />
      <ActivityDetailDialog
        entry={detailEntry}
        open={detailEntry !== null}
        onOpenChange={(open) => {
          if (!open) setDetailEntry(null);
        }}
      />
    </section>
  );
}
