import { NextRequest, NextResponse } from "next/server";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { createServerClient } from "@/lib/supabase/client";

async function fetchOnChainBalance(id: string) {
  const supabase = createServerClient();
  const { data: trader, error } = await supabase
    .from("traders")
    .select("token_id, name")
    .eq("id", id)
    .single();

  if (error || !trader) return null;

  const publicClient = makePublicClient();
  const balanceRaw = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: [BigInt(trader.token_id)],
  });

  return {
    trader_id: id,
    token_id: trader.token_id,
    name: trader.name,
    balance_usdc: Number(balanceRaw) / 1_000_000,
    balance_raw: balanceRaw.toString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await fetchOnChainBalance(id);
    if (!result) {
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }
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
    if (!result) {
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }

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
