import { NextResponse } from "next/server";
import { getLatestNarrative } from "@/lib/supabase/queries";

export async function GET() {
  try {
    const narrative = await getLatestNarrative();
    if (!narrative) {
      return NextResponse.json({ narrative: null });
    }
    return NextResponse.json({ narrative });
  } catch (e) {
    console.error("Narrative fetch error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
