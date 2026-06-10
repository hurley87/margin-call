import { formatToastMoney } from "@/lib/live-game-toasts";

export type TickerItemKind = "win" | "loss" | "wipeout" | "enter" | "deal";

export type TickerItem = {
  id: string;
  kind: TickerItemKind;
  text: string;
  createdAt: number;
  /** Static period-flavor filler (not a live event); rendered muted. */
  isFiller?: boolean;
};

export type TickerActivitySource = {
  id: string;
  trader_id: string;
  activity_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TickerDealSource = {
  id: string;
  potUsdc: number;
  entryCostUsdc: number;
  createdAt: number;
};

const HEADLINE_TYPES = new Set(["win", "loss", "wipeout", "enter"]);

function activityTickerText(
  entry: TickerActivitySource,
  traderName: string
): string {
  const pnl = Number(entry.metadata?.pnl);
  const pnlLabel = Number.isFinite(pnl)
    ? ` ${pnl >= 0 ? "+" : "-"}${formatToastMoney(Math.abs(pnl))}`
    : "";
  switch (entry.activity_type) {
    case "win":
      return `▲ ${traderName} WIN${pnlLabel}`;
    case "loss":
      return `▼ ${traderName} LOSS${pnlLabel}`;
    case "wipeout":
      return `✕ MARGIN CALL — ${traderName} WIPED OUT`;
    default:
      return `● ${traderName} ENTERS A DEAL`;
  }
}

/**
 * Headline events for the bottom ticker tape: wins/losses/wipeouts/entries
 * from the global activity feed plus newly created deals, newest first.
 */
export function buildTickerItems(params: {
  activity: readonly TickerActivitySource[];
  traderNames: Record<string, string>;
  deals: readonly TickerDealSource[];
  limit?: number;
}): TickerItem[] {
  const limit = params.limit ?? 20;

  const activityItems: TickerItem[] = params.activity
    .filter((entry) => HEADLINE_TYPES.has(entry.activity_type))
    .map((entry) => ({
      id: `activity:${entry.id}`,
      kind: entry.activity_type as TickerItemKind,
      text: activityTickerText(
        entry,
        params.traderNames[entry.trader_id] ?? "UNKNOWN"
      ),
      createdAt: Date.parse(entry.created_at),
    }));

  const dealItems: TickerItem[] = params.deals.map((deal) => ({
    id: `deal:${deal.id}`,
    kind: "deal",
    text: `◆ NEW DEAL — POT ${formatToastMoney(deal.potUsdc)} / ENTRY ${formatToastMoney(deal.entryCostUsdc)}`,
    createdAt: deal.createdAt,
  }));

  return [...activityItems, ...dealItems]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
