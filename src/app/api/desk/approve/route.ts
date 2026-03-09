import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { resolveApproval, getApproval } from "@/lib/supabase/approvals";
import { logActivity } from "@/lib/agent/activity";

export async function POST(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { approval_id, action, reason } = body;

    if (!approval_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "approval_id and action (approve/reject) are required" },
        { status: 400 }
      );
    }

    // Fetch approval to get trader_id, then verify ownership
    const approval = await getApproval(approval_id);
    await getOwnedTrader(approval.trader_id, walletAddress);

    const status = action === "approve" ? "approved" : "rejected";
    const updated = await resolveApproval(approval_id, status, reason);

    const activityType = action === "approve" ? "approved" : "rejected";
    await logActivity(
      approval.trader_id,
      activityType,
      `Deal ${action}d by desk manager${reason ? `: ${reason}` : ""}`,
      approval.deal_id
    );

    return NextResponse.json({
      message: `Approval ${status}`,
      approval: updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("expired") || message.includes("already")
          ? 409
          : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
