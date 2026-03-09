import { NextResponse } from "next/server";
import { listGlobalActivity } from "@/lib/supabase/leaderboard";

export async function GET() {
  try {
    const { activity, traderNames } = await listGlobalActivity();
    return NextResponse.json({ activity, traderNames });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load global activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
