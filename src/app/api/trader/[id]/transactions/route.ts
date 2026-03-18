import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, getPrivyWalletAddress } from "@/lib/privy/server";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { createTraderTransaction } from "@/lib/supabase/queries";

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
    const trader = await getOwnedTrader(id, walletAddress);

    const body = await request.json();
    const { type, tx_hash, amount_usdc } = body as {
      type?: string;
      tx_hash?: string;
      amount_usdc?: number;
    };

    if (!type || !tx_hash) {
      return NextResponse.json(
        { error: "type and tx_hash are required" },
        { status: 400 }
      );
    }

    if (type !== "deposit" && type !== "withdrawal") {
      return NextResponse.json(
        { error: "type must be 'deposit' or 'withdrawal'" },
        { status: 400 }
      );
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
      return NextResponse.json(
        { error: "Invalid tx_hash format" },
        { status: 400 }
      );
    }

    await createTraderTransaction({
      trader_id: trader.id,
      type,
      tx_hash,
      amount_usdc: amount_usdc ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Trader transaction error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
