import { NextRequest, NextResponse } from "next/server";
import { listOpenDealsByCreator } from "@/lib/supabase/queries";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";

export async function GET(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);

    const walletAddress = getPrivyWalletAddress(user);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const deals = await listOpenDealsByCreator(walletAddress);
    return NextResponse.json({ deals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("Authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
