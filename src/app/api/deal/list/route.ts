import { NextRequest, NextResponse } from "next/server";
import { listOpenDealsByCreatorAddress } from "@/lib/supabase/queries";
import { verifyPrivyToken } from "@/lib/privy/server";

export async function GET(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const deals = await listOpenDealsByCreatorAddress(walletAddress);
    return NextResponse.json({ deals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
