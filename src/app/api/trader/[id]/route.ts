import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPrivyToken(request);

    const { id } = await params;
    const supabase = createServerClient();

    const { data: trader, error } = await supabase
      .from("traders")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }

    return NextResponse.json({ trader });
  } catch (e) {
    console.error("Get trader error:", e);
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
