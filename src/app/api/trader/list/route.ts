import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  try {
    await verifyPrivyToken(request);

    const owner = request.nextUrl.searchParams.get("owner");
    if (!owner) {
      return NextResponse.json(
        { error: "owner query parameter is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: traders, error } = await supabase
      .from("traders")
      .select("*")
      .eq("owner_address", owner.toLowerCase())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ traders });
  } catch (e) {
    console.error("List traders error:", e);
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
