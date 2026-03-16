const WIRE_SOURCES: Record<
  string,
  { handle: string; name: string; initial: string }
> = {
  breaking: { handle: "@WIRE", name: "THE WIRE", initial: "W" },
  rumor: { handle: "@FLOOR", name: "FLOOR TALK", initial: "F" },
  investigation: { handle: "@SEC_WATCH", name: "SEC WATCH", initial: "S" },
  market_move: { handle: "@TICKER", name: "THE TICKER", initial: "T" },
  corporate_drama: { handle: "@BOARDROOM", name: "BOARDROOM", initial: "B" },
  politics: { handle: "@BELTWAY", name: "DC INSIDER", initial: "D" },
};

const DEFAULT_SOURCE = { handle: "@WIRE", name: "THE WIRE", initial: "W" };

function getSource(category: string) {
  return WIRE_SOURCES[category] ?? DEFAULT_SOURCE;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function WireSourceLine({
  category,
  createdAt,
}: {
  category: string;
  createdAt: string;
}) {
  const source = getSource(category);
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="font-bold text-[var(--t-text)]">{source.name}</span>
      <span className="text-[var(--t-muted)]">{source.handle}</span>
      <span className="text-[var(--t-muted)]">·</span>
      <span className="text-[var(--t-muted)]">{timeAgo(createdAt)}</span>
    </div>
  );
}
