import { NextResponse } from "next/server";
import { listLeaderboard } from "@/lib/supabase/leaderboard";

export async function GET() {
  try {
    const traders = await listLeaderboard();
    return NextResponse.json({ traders });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
