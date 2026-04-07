import { NextResponse } from "next/server";
import { listTraderOutcomes } from "@/lib/supabase/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const outcomes = await listTraderOutcomes(id);
    return NextResponse.json(
      { outcomes },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load outcomes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
