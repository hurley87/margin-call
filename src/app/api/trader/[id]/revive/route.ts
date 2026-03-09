import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { logActivity } from "@/lib/agent/activity";

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

    if (trader.status !== "wiped_out") {
      return NextResponse.json(
        { error: "Only wiped out traders can be revived" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: updated, error: updateError } = await supabase
      .from("traders")
      .update({ status: "paused" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logActivity(
      id,
      "revive",
      `Trader "${trader.name}" revived by desk manager`
    );

    return NextResponse.json({ message: "Trader revived", trader: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "You do not own this trader" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
