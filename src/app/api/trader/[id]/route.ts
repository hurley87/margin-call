import { NextRequest, NextResponse } from "next/server";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";
import { getOwnedTrader } from "@/lib/supabase/traders";

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

    return NextResponse.json({ trader });
  } catch (e) {
    console.error("Get trader error:", e);
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
