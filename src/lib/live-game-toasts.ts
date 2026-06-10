import type { TraderProfile } from "@/hooks/use-activity-feed";
import { formatShortAddress } from "@/lib/utils";

export type LiveDealToastSource = {
  id: string;
  prompt: string;
  sourceHeadline?: string | null;
  potUsdc: number;
  entryCostUsdc: number;
  creatorAddress?: string | null;
  createdAt: number;
};

export type LiveActivityToastSource = {
  id: string;
  traderId: string;
  activityType: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type LiveGameToast =
  | {
      id: string;
      kind: "deal";
      title: "NEW DEAL HIT THE FLOOR";
      body: string;
      meta: string;
      href: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "wipeout";
      title: "MARGIN CALL";
      body: string;
      meta: string;
      href: string;
      traderName: string;
      traderProfile?: TraderProfile;
      createdAt: number;
    };

export function formatToastMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

export function shortToastText(value: string, maxLength = 118): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function seedLiveToastSeenIds(params: {
  deals: LiveDealToastSource[];
  activity: LiveActivityToastSource[];
}) {
  return {
    dealIds: new Set(params.deals.map((deal) => deal.id)),
    activityIds: new Set(params.activity.map((entry) => entry.id)),
  };
}

export function selectNewLiveGameToasts(params: {
  deals: LiveDealToastSource[];
  activity: LiveActivityToastSource[];
  seenDealIds: ReadonlySet<string>;
  seenActivityIds: ReadonlySet<string>;
  traderNames: Record<string, string>;
  traderProfiles: Record<string, TraderProfile>;
  /** Trader ids whose wipeouts are covered elsewhere (ceremony overlay). */
  suppressWipeoutTraderIds?: ReadonlySet<string>;
}): LiveGameToast[] {
  const dealToasts: LiveGameToast[] = params.deals
    .filter((deal) => !params.seenDealIds.has(deal.id))
    .map((deal) => ({
      id: `deal:${deal.id}`,
      kind: "deal",
      title: "NEW DEAL HIT THE FLOOR",
      body: shortToastText(deal.sourceHeadline || deal.prompt),
      meta: `Pot ${formatToastMoney(deal.potUsdc)} · Entry ${formatToastMoney(
        deal.entryCostUsdc
      )} · ${formatShortAddress(deal.creatorAddress, "DESK")}`,
      href: `/?deal=${encodeURIComponent(deal.id)}`,
      createdAt: deal.createdAt,
    }));

  const wipeoutToasts: LiveGameToast[] = params.activity
    .filter(
      (entry) =>
        entry.activityType === "wipeout" &&
        !params.seenActivityIds.has(entry.id) &&
        !params.suppressWipeoutTraderIds?.has(entry.traderId)
    )
    .map((entry) => {
      const traderName = params.traderNames[entry.traderId] ?? "Unknown trader";
      const pnl = Number(entry.metadata?.pnl);
      const meta = Number.isFinite(pnl)
        ? `P&L ${pnl >= 0 ? "+" : ""}${formatToastMoney(pnl)}`
        : "Trader liquidated";

      return {
        id: `wipeout:${entry.id}`,
        kind: "wipeout",
        title: "MARGIN CALL",
        body: `${traderName} was wiped out`,
        meta,
        href: `/?trader=${encodeURIComponent(entry.traderId)}`,
        traderName,
        traderProfile: params.traderProfiles[entry.traderId],
        createdAt: entry.createdAt,
      };
    });

  return [...dealToasts, ...wipeoutToasts].sort(
    (a, b) => a.createdAt - b.createdAt
  );
}
