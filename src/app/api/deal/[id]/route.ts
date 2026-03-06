import { NextRequest, NextResponse } from "next/server";
import { getDeal, listDealOutcomes } from "@/lib/supabase/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deal, outcomes] = await Promise.all([
      getDeal(id),
      listDealOutcomes(id),
    ]);
    return NextResponse.json({ deal, outcomes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
