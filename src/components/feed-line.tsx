import type { AgentActivity } from "@/hooks/use-agent";

export const FEED_DISPLAY: Record<string, { label: string; color: string }> = {
  cycle_start: { label: "CYCLE", color: "text-[var(--t-muted)]" },
  scan: { label: "SCAN", color: "text-[var(--t-muted)]" },
  evaluate: { label: "EVAL", color: "text-[var(--t-accent)]" },
  skip: { label: "SKIP", color: "text-[var(--t-muted)]" },
  enter: { label: "ENTER", color: "text-[var(--t-accent)]" },
  win: { label: "WIN", color: "text-[var(--t-green)]" },
  loss: { label: "LOSS", color: "text-[var(--t-red)]" },
  wipeout: { label: "WIPEOUT", color: "text-[var(--t-red)]" },
  pause: { label: "PAUSE", color: "text-[var(--t-amber)]" },
  resume: { label: "RESUME", color: "text-[var(--t-green)]" },
  revive: { label: "REVIVE", color: "text-[var(--t-accent)]" },
  approval_required: { label: "APPROVAL", color: "text-[var(--t-amber)]" },
  approved: { label: "OK", color: "text-[var(--t-green)]" },
  rejected: { label: "DENIED", color: "text-[var(--t-red)]" },
  error: { label: "ERR", color: "text-[var(--t-red)]" },
  cycle_end: { label: "DONE", color: "text-[var(--t-muted)]" },
};

export function FeedLine({
  entry,
  traderName,
  showTrader,
}: {
  entry: AgentActivity;
  traderName: string;
  showTrader: boolean;
}) {
  const display = FEED_DISPLAY[entry.activity_type] ?? {
    label: entry.activity_type.toUpperCase(),
    color: "text-[var(--t-muted)]",
  };
  const time = new Date(entry.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const isHighEvent =
    entry.activity_type === "win" ||
    entry.activity_type === "loss" ||
    entry.activity_type === "wipeout";

  return (
    <div
      className={`flex items-start gap-2 border-b border-[var(--t-border)] last:border-b-0 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--t-surface)] ${
        entry.activity_type === "wipeout"
          ? "bg-[#D48787]/5"
          : "bg-[var(--t-bg)]"
      }`}
    >
      <span className="shrink-0 text-[var(--t-muted)]">{time}</span>
      <span className={`w-12 shrink-0 text-right font-bold ${display.color}`}>
        {display.label}
      </span>
      {showTrader && (
        <span className="w-16 shrink-0 truncate text-[var(--t-accent)]">
          {traderName}
        </span>
      )}
      <span
        className={`flex-1 truncate ${isHighEvent ? "text-[var(--t-text)]" : "text-[var(--t-muted)]"}`}
      >
        {entry.message}
      </span>
    </div>
  );
}
