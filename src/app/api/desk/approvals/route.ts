import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { listPendingApprovalsByOwner } from "@/lib/supabase/approvals";

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

    const approvals = await listPendingApprovalsByOwner(walletAddress);

    return NextResponse.json({ approvals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
