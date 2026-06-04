"use client";

import { Dialog } from "@base-ui/react/dialog";
import { FEED_DISPLAY } from "@/components/feed-line";
import type { AgentActivity } from "@/hooks/use-agent";
import { DIALOG_BACKDROP_CLASS, dialogPopupClass } from "@/lib/utils";

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function ActivityDetailDialog({
  entry,
  traderName,
  open,
  onOpenChange,
}: {
  entry: AgentActivity | null;
  traderName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const display = FEED_DISPLAY[entry.activity_type] ?? {
    label: entry.activity_type.toUpperCase(),
    color: "text-[var(--t-muted)]",
  };
  const timestamp = new Date(entry.created_at).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  const metadataEntries = Object.entries(entry.metadata);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("lg")}>
          <Dialog.Title className="sr-only">Activity detail</Dialog.Title>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                Trader tape
              </p>
              <h2 className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide text-[var(--t-amber)]">
                Activity detail
              </h2>
            </div>
            <Dialog.Close className="min-h-10 shrink-0 px-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none">
              Close
            </Dialog.Close>
          </div>

          <div className="max-h-[calc(88vh-4rem)] overflow-y-auto px-4 py-4">
            <div className="grid gap-3 border border-[var(--t-border)] bg-[#070b09] p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Type
                </p>
                <p
                  className={`mt-1 font-bold uppercase tracking-wide ${display.color}`}
                >
                  {display.label}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Time
                </p>
                <p className="mt-1 tabular-nums text-[var(--t-text)]">
                  {timestamp}
                </p>
              </div>
              {traderName ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                    Trader
                  </p>
                  <p className="mt-1 font-bold text-[var(--t-accent)]">
                    {traderName}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border border-[var(--t-border)] bg-[#070b09] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                Message
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--t-text)]">
                {entry.message}
              </p>
            </div>

            {metadataEntries.length > 0 ? (
              <div className="mt-4 border border-[var(--t-border)] bg-[#070b09] p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Metadata
                </p>
                <dl className="mt-2 space-y-2">
                  {metadataEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--t-accent)]">
                        {key}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs text-[var(--t-muted)]">
                        {formatMetadataValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
