import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { logActivity } from "@/lib/agent/activity";
import { getBaseUrl } from "@/lib/agent/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const trader = await getOwnedTrader(id, walletAddress);

    if (trader.status === "active") {
      return NextResponse.json({ message: "Trader is already active", trader });
    }
    if (trader.status === "wiped_out") {
      return NextResponse.json(
        { error: "Cannot resume a wiped out trader" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: updated, error: updateError } = await supabase
      .from("traders")
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logActivity(
      id,
      "resume",
      `Trader "${trader.name}" resumed by desk manager`
    );

    // Kick off the trade cycle
    const baseUrl = getBaseUrl(request);
    fetch(`${baseUrl}/api/agent/cycle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": process.env.AGENT_CYCLE_SECRET ?? "",
      },
      body: JSON.stringify({ trader_id: id }),
    }).catch((err) => {
      console.error("Failed to kick off trade cycle:", err);
    });

    return NextResponse.json({
      message: "Trader resumed, trade cycle started",
      trader: updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "You do not own this trader" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
