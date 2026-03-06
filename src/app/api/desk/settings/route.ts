import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);

    const walletAccount = user.linkedAccounts?.find((a) => a.type === "wallet");
    const walletAddress =
      user.wallet?.address ??
      (walletAccount && "address" in walletAccount
        ? (walletAccount as { address: string }).address
        : undefined);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { display_name, settings } = body;

    if (
      display_name !== undefined &&
      (typeof display_name !== "string" || display_name.trim().length === 0)
    ) {
      return NextResponse.json(
        { error: "display_name must be a non-empty string" },
        { status: 400 }
      );
    }

    if (
      settings !== undefined &&
      (typeof settings !== "object" || settings === null)
    ) {
      return NextResponse.json(
        { error: "settings must be an object" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (display_name !== undefined) updates.display_name = display_name.trim();
    if (settings !== undefined) updates.settings = settings;

    const { data, error } = await supabase
      .from("desk_managers")
      .update(updates)
      .eq("wallet_address", walletAddress)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deskManager: data });
  } catch (e) {
    console.error("Settings error:", e);
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
