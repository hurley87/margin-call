import { NextRequest, NextResponse } from "next/server";
import { getNarrativeHistory } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50);
    const narratives = await getNarrativeHistory(limit);
    return NextResponse.json({ narratives });
  } catch (e) {
    console.error("Narrative history error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
