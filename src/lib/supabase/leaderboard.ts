import { createServerClient } from "./client";

export interface LeaderboardTrader {
  id: string;
  name: string;
  status: string;
  owner_address: string;
  total_pnl: number;
  wins: number;
  losses: number;
  wipeouts: number;
  deal_count: number;
  win_rate: number;
  total_value: number;
}

export async function listLeaderboard(
  limit = 50
): Promise<LeaderboardTrader[]> {
  const supabase = createServerClient();

  // Fetch all traders
  const { data: traders, error: tradersError } = await supabase
    .from("traders")
    .select("id, name, status, owner_address, escrow_balance_usdc")
    .order("created_at", { ascending: false });

  if (tradersError) throw tradersError;
  if (!traders || traders.length === 0) return [];

  // Fetch all deal outcomes for aggregate stats
  const { data: outcomes, error: outcomesError } = await supabase
    .from("deal_outcomes")
    .select("trader_id, trader_pnl_usdc, trader_wiped_out");

  if (outcomesError) throw outcomesError;

  // Fetch all assets for total value
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("trader_id, value_usdc");

  if (assetsError) throw assetsError;

  // Aggregate outcomes by trader
  const statsMap = new Map<
    string,
    {
      pnl: number;
      wins: number;
      losses: number;
      wipeouts: number;
      deals: number;
    }
  >();
  for (const o of outcomes ?? []) {
    const s = statsMap.get(o.trader_id) ?? {
      pnl: 0,
      wins: 0,
      losses: 0,
      wipeouts: 0,
      deals: 0,
    };
    s.pnl += o.trader_pnl_usdc;
    s.deals += 1;
    if (o.trader_wiped_out) {
      s.wipeouts += 1;
    } else if (o.trader_pnl_usdc > 0) {
      s.wins += 1;
    } else {
      s.losses += 1;
    }
    statsMap.set(o.trader_id, s);
  }

  // Aggregate asset values by trader
  const assetMap = new Map<string, number>();
  for (const a of assets ?? []) {
    assetMap.set(a.trader_id, (assetMap.get(a.trader_id) ?? 0) + a.value_usdc);
  }

  // Build leaderboard
  const leaderboard: LeaderboardTrader[] = traders.map((t) => {
    const s = statsMap.get(t.id) ?? {
      pnl: 0,
      wins: 0,
      losses: 0,
      wipeouts: 0,
      deals: 0,
    };
    const assetValue = assetMap.get(t.id) ?? 0;
    const totalDeals = s.wins + s.losses + s.wipeouts;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      owner_address: t.owner_address,
      total_pnl: s.pnl,
      wins: s.wins,
      losses: s.losses,
      wipeouts: s.wipeouts,
      deal_count: s.deals,
      win_rate: totalDeals > 0 ? (s.wins / totalDeals) * 100 : 0,
      total_value: (t.escrow_balance_usdc ?? 0) + assetValue,
    };
  });

  // Default sort by P&L descending
  leaderboard.sort((a, b) => b.total_pnl - a.total_pnl);

  return leaderboard.slice(0, limit);
}

export async function listGlobalActivity(limit = 100) {
  const supabase = createServerClient();

  const { data: activity, error: activityError } = await supabase
    .from("agent_activity_log")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);

  if (activityError) throw activityError;

  // Build trader name map from unique trader IDs
  const traderIds = [
    ...new Set((activity ?? []).map((a: { trader_id: string }) => a.trader_id)),
  ];
  const traderNames: Record<string, string> = {};

  if (traderIds.length > 0) {
    const { data: traders } = await supabase
      .from("traders")
      .select("id, name")
      .in("id", traderIds);

    for (const t of traders ?? []) {
      traderNames[t.id] = t.name;
    }
  }

  return { activity: activity ?? [], traderNames };
}
