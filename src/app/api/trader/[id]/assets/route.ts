import { NextRequest, NextResponse } from "next/server";
import { getTraderAssets } from "@/lib/supabase/queries";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";

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
    await getOwnedTrader(id, walletAddress);
    const assets = await getTraderAssets(id);
    return NextResponse.json({ assets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load assets";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
