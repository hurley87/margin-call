import { type NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(req: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(req);

    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json({ error: "No wallet" }, { status: 400 });
    }

    return await getPortfolio(walletAddress);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

async function getPortfolio(walletAddress: string) {
  const supabase = createServerClient();

  // Get all traders owned by this desk manager
  const { data: traders, error: tradersErr } = await supabase
    .from("traders")
    .select("id, name, status, escrow_balance_usdc")
    .eq("owner_address", walletAddress.toLowerCase());

  if (tradersErr) {
    return NextResponse.json({ error: tradersErr.message }, { status: 500 });
  }

  if (!traders || traders.length === 0) {
    return NextResponse.json({
      total_value_usdc: 0,
      traders: [],
      pnl_history: [],
      stats: {
        total_wins: 0,
        total_losses: 0,
        total_wipeouts: 0,
        total_pnl: 0,
      },
    });
  }

  const traderIds = traders.map((t) => t.id);

  // Get all outcomes for these traders (for P&L history + stats)
  const { data: outcomes } = await supabase
    .from("deal_outcomes")
    .select(
      "trader_id, trader_pnl_usdc, rake_usdc, trader_wiped_out, created_at"
    )
    .in("trader_id", traderIds)
    .order("created_at", { ascending: true });

  // Get assets for total value calculation
  const { data: assets } = await supabase
    .from("assets")
    .select("trader_id, value_usdc")
    .in("trader_id", traderIds);

  // Calculate total portfolio value (escrow balances + asset values)
  const assetValueByTrader: Record<string, number> = {};
  for (const asset of assets ?? []) {
    assetValueByTrader[asset.trader_id] =
      (assetValueByTrader[asset.trader_id] ?? 0) + Number(asset.value_usdc);
  }

  let totalValueUsdc = 0;
  const traderSummaries = traders.map((t) => {
    const escrow = Number(t.escrow_balance_usdc ?? 0);
    const assetValue = assetValueByTrader[t.id] ?? 0;
    const total = escrow + assetValue;
    totalValueUsdc += total;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      escrow_usdc: escrow,
      asset_value_usdc: assetValue,
      total_value_usdc: total,
    };
  });

  // Build P&L history (cumulative P&L over time)
  let cumPnl = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalWipeouts = 0;
  let totalPnl = 0;

  const pnlHistory: { timestamp: string; cumulative_pnl: number }[] = [];

  for (const o of outcomes ?? []) {
    const pnl = Number(o.trader_pnl_usdc);
    cumPnl += pnl;
    totalPnl += pnl;

    if (pnl > 0) totalWins++;
    else if (pnl < 0) totalLosses++;
    if (o.trader_wiped_out) totalWipeouts++;

    pnlHistory.push({
      timestamp: o.created_at,
      cumulative_pnl: cumPnl,
    });
  }

  return NextResponse.json({
    total_value_usdc: totalValueUsdc,
    traders: traderSummaries,
    pnl_history: pnlHistory,
    stats: {
      total_wins: totalWins,
      total_losses: totalLosses,
      total_wipeouts: totalWipeouts,
      total_pnl: totalPnl,
    },
  });
}
