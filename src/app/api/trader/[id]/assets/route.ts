import { NextRequest, NextResponse } from "next/server";
import { getTraderAssets } from "@/lib/supabase/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const assets = await getTraderAssets(id);
    return NextResponse.json({ assets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load assets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
