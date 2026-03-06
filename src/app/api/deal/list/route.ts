import { NextResponse } from "next/server";
import { listOpenDeals } from "@/lib/supabase/queries";

export async function GET() {
  try {
    const deals = await listOpenDeals();
    return NextResponse.json({ deals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
