import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { listActivityFeed } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = user.wallet?.address;

    if (!walletAddress) {
      return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: traders, error: tradersError } = await supabase
      .from("traders")
      .select("id, name")
      .eq("owner_address", walletAddress.toLowerCase());

    if (tradersError) {
      return NextResponse.json(
        { error: tradersError.message },
        { status: 500 }
      );
    }

    const traderIds = (traders ?? []).map((t: { id: string }) => t.id);
    const traderNames: Record<string, string> = {};
    for (const t of traders ?? []) {
      traderNames[t.id] = t.name;
    }

    const activity = await listActivityFeed(traderIds);

    return NextResponse.json({ activity, traderNames });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
