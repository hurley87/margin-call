"use client";

import { useEffect, useState } from "react";
import { FeedLine } from "@/components/feed-line";
import { useAgentActivity } from "@/hooks/use-agent";

interface TraderActivityPanelProps {
  traderId: string;
}

const ACTIVITY_PAGE_SIZE = 10;

export function TraderActivityPanel({ traderId }: TraderActivityPanelProps) {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const {
    data: activity,
    isLoading,
    isError,
    error,
  } = useAgentActivity(traderId);
  const totalCount = activity?.length ?? 0;
  const visibleActivity = activity?.slice(0, visibleCount) ?? [];
  const hasMore = visibleCount < totalCount;
  const canShowLess = visibleCount > ACTIVITY_PAGE_SIZE;

  useEffect(() => {
    setVisibleCount(ACTIVITY_PAGE_SIZE);
  }, [traderId]);

  return (
    <section>
      <div className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
              Live Activity
            </h2>
          </div>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--t-accent)]">
            {totalCount > ACTIVITY_PAGE_SIZE
              ? `${visibleActivity.length}/${totalCount} Events`
              : `${totalCount} Events`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-y border-[var(--t-border)]/80 py-2 text-xs uppercase tracking-wider text-[var(--t-muted)]">
        <span className="shrink-0">Time</span>
        <span className="w-12 shrink-0 text-right">Type</span>
        <span className="flex-1">Message</span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-[var(--t-muted)]">
          Loading activity...<span className="cursor-blink">█</span>
        </div>
      ) : isError ? (
        <div className="py-6 text-center">
          <p className="text-sm text-[var(--t-red)]">
            {error instanceof Error
              ? error.message
              : "Failed to load trader activity."}
          </p>
        </div>
      ) : !activity || activity.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-[var(--t-muted)]">
            No realtime activity yet.
          </p>
        </div>
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
                    className="border border-[var(--t-border)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
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
                    className="border border-[var(--t-border)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
                  >
                    Load 10 More
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
