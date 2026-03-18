import { NextRequest, NextResponse } from "next/server";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";
import { listTraderTransactions } from "@/lib/supabase/queries";

interface HistoryEvent {
  type: "deposit" | "withdrawal" | "enter" | "resolve";
  block: number;
  txHash: string;
  amount?: number;
  dealId?: number;
  pnl?: number;
  rake?: number;
}

/**
 * GET /api/trader/[id]/history
 * Returns transaction history for a trader from Supabase.
 */
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
    const trader = await getOwnedTrader(id, walletAddress);

    const transactions = await listTraderTransactions(trader.id);
    const events: HistoryEvent[] = transactions.map((tx) => ({
      type: tx.type as HistoryEvent["type"],
      block: tx.block_number ?? 0,
      txHash: tx.tx_hash,
      amount: tx.amount_usdc != null ? Number(tx.amount_usdc) : undefined,
      dealId: tx.on_chain_deal_id ?? undefined,
      pnl: tx.pnl_usdc != null ? Number(tx.pnl_usdc) : undefined,
      rake: tx.rake_usdc != null ? Number(tx.rake_usdc) : undefined,
    }));

    return NextResponse.json({ events });
  } catch (e) {
    console.error("Trader history error:", e);
    const message = e instanceof Error ? e.message : "Failed to fetch history";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
