import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { getTrader } from "@/lib/supabase/traders";
import { getEscrowBalance } from "@/lib/contracts/balance";

async function fetchOnChainBalance(id: string) {
  const trader = await getTrader(id);
  const balanceUsdc = await getEscrowBalance(trader.token_id);

  return {
    trader_id: id,
    token_id: trader.token_id,
    name: trader.name,
    balance_usdc: balanceUsdc,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await fetchOnChainBalance(id);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch balance";
    console.error("Trader balance error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Sync a single trader's on-chain balance to Supabase */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await fetchOnChainBalance(id);

    const supabase = createServerClient();
    const { error } = await supabase
      .from("traders")
      .update({ escrow_balance_usdc: result.balance_usdc })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      trader_id: id,
      balance_usdc: result.balance_usdc,
      synced: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sync balance";
    console.error("Trader balance sync error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
