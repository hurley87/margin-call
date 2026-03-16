import { NextRequest, NextResponse } from "next/server";
import { listOpenDeals } from "@/lib/supabase/queries";
import { verifyPrivyToken } from "@/lib/privy/server";

export async function GET(request: NextRequest) {
  try {
    await verifyPrivyToken(request);

    const deals = await listOpenDeals();
    return NextResponse.json({ deals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
