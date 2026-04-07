import { NextResponse } from "next/server";
import { listTraderActivity } from "@/lib/supabase/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const activity = await listTraderActivity(id);
    return NextResponse.json(
      { activity },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
