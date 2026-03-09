import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { logActivity } from "@/lib/agent/activity";
import { getBaseUrl } from "@/lib/agent/auth";
import { getOrCreateTraderSmartAccount } from "@/lib/cdp/trader-wallet";
import { signAgentRequest } from "@/lib/siwa/sign";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const trader = await getOwnedTrader(id, walletAddress);

    if (trader.status === "active") {
      return NextResponse.json({ message: "Trader is already active", trader });
    }
    if (trader.status === "wiped_out") {
      return NextResponse.json(
        { error: "Cannot resume a wiped out trader" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: updated, error: updateError } = await supabase
      .from("traders")
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logActivity(
      id,
      "resume",
      `Trader "${trader.name}" resumed by desk manager`
    );

    // Kick off the trade cycle with SIWA auth
    const baseUrl = getBaseUrl(request);
    (async () => {
      try {
        const { owner, smartAccount } = await getOrCreateTraderSmartAccount(
          trader.token_id
        );
        const nonceRes = await fetch(`${baseUrl}/api/siwa/nonce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: trader.token_id,
            address: smartAccount.address,
          }),
        });
        let siwaHeaders: Record<string, string> = {};
        if (nonceRes.ok) {
          const { nonce } = await nonceRes.json();
          const { message, signature } = await signAgentRequest(
            owner,
            trader.token_id,
            nonce,
            smartAccount
          );
          siwaHeaders = {
            "x-siwa-message": Buffer.from(message).toString("base64"),
            "x-siwa-signature": signature,
          };
        }
        await fetch(`${baseUrl}/api/agent/cycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...siwaHeaders },
          body: JSON.stringify({ trader_id: id }),
        });
      } catch (err) {
        console.error("Failed to kick off trade cycle:", err);
      }
    })();

    return NextResponse.json({
      message: "Trader resumed, trade cycle started",
      trader: updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "You do not own this trader" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
