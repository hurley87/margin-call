import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { getEscrowBalance } from "@/lib/contracts/balance";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";

async function fetchOnChainBalance(id: string, walletAddress: string) {
  const trader = await getOwnedTrader(id, walletAddress);
  const balanceUsdc = await getEscrowBalance(trader.token_id);

  return {
    trader_id: id,
    token_id: trader.token_id,
    name: trader.name,
    balance_usdc: balanceUsdc,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = getPrivyWalletAddress(user);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const result = await fetchOnChainBalance(id, walletAddress);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch balance";
    console.error("Trader balance error:", e);
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Sync a single trader's on-chain balance to Supabase */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = getPrivyWalletAddress(user);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const result = await fetchOnChainBalance(id, walletAddress);

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
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
