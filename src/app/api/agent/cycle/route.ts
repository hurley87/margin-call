import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runCycle } from "@/lib/agent/cycle";
import { logActivity } from "@/lib/agent/activity";
import { getBaseUrl } from "@/lib/agent/auth";
import { verifySIWARequest } from "@/lib/siwa/verify";
import { siwaAuthMatchesTrader } from "@/lib/siwa/binding";
import { createServerClient } from "@/lib/supabase/client";
import { getTrader } from "@/lib/supabase/traders";
import { AGENT_LOOP_INTERVAL_MS } from "@/lib/constants";
import { agentCycleLimit, checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/agent/cycle
 *
 * Runs one iteration of the autonomous trade cycle for a trader.
 * If the trader is still active after the cycle, schedules the next
 * iteration after AGENT_LOOP_INTERVAL_MS (30s) using next/server's after().
 *
 * Zombie loop prevention: stamps `last_cycle_at` before running and checks
 * that no other cycle has started since when scheduling the next iteration.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify SIWA (Sign In With Agent) authentication
    const siwaMessageB64 = request.headers.get("x-siwa-message");
    const siwaSignature = request.headers.get("x-siwa-signature");
    if (!siwaMessageB64 || !siwaSignature) {
      return NextResponse.json(
        { error: "Missing SIWA auth headers" },
        { status: 401 }
      );
    }
    const siwaMessage = Buffer.from(siwaMessageB64, "base64").toString("utf-8");
    const siwaResult = await verifySIWARequest(siwaMessage, siwaSignature);
    if (!siwaResult.valid) {
      return NextResponse.json({ error: "Invalid SIWA auth" }, { status: 401 });
    }

    const body = await request.json();
    const { trader_id } = body as { trader_id?: string };

    if (!trader_id) {
      return NextResponse.json(
        { error: "trader_id is required" },
        { status: 400 }
      );
    }

    const trader = await getTrader(trader_id);
    if (!siwaAuthMatchesTrader(siwaResult, trader)) {
      return NextResponse.json(
        { error: "SIWA identity does not match trader" },
        { status: 403 }
      );
    }

    // Rate limit: 1 request per 30s per trader
    const limited = await checkRateLimit(
      agentCycleLimit,
      `trader:${trader_id}`
    );
    if (limited) return limited;

    // Stamp cycle start time for deduplication
    const cycleStartedAt = new Date().toISOString();
    const supabase = createServerClient();
    await supabase
      .from("traders")
      .update({ last_cycle_at: cycleStartedAt })
      .eq("id", trader_id);

    const baseUrl = getBaseUrl(request);
    const result = await runCycle(trader_id, baseUrl);

    // Schedule next cycle only if trader should keep trading
    const shouldContinue =
      result.status === "entered" ||
      result.status === "no_deals" ||
      result.status === "skipped_all";

    if (shouldContinue) {
      after(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, AGENT_LOOP_INTERVAL_MS)
        );

        // Zombie guard: only continue if no newer cycle has started
        const { data: trader } = await supabase
          .from("traders")
          .select("last_cycle_at, status")
          .eq("id", trader_id)
          .single();

        if (
          !trader ||
          trader.status !== "active" ||
          trader.last_cycle_at !== cycleStartedAt
        ) {
          return; // Another cycle took over, or trader was paused/wiped
        }

        try {
          // Sign next cycle request with trader's SIWA identity
          const { getOrCreateTraderSmartAccount } =
            await import("@/lib/cdp/trader-wallet");
          const { signAgentRequest } = await import("@/lib/siwa/sign");
          const { getTrader } = await import("@/lib/supabase/traders");

          const traderData = await getTrader(trader_id);
          const { owner, smartAccount } = await getOrCreateTraderSmartAccount(
            traderData.token_id
          );

          const nonceRes = await fetch(`${baseUrl}/api/siwa/nonce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_id: traderData.token_id,
              address: smartAccount.address,
            }),
          });

          let siwaHeaders: Record<string, string> = {};
          if (nonceRes.ok) {
            const { nonce } = await nonceRes.json();
            const { message, signature } = await signAgentRequest(
              owner,
              traderData.token_id,
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
            headers: {
              "Content-Type": "application/json",
              ...siwaHeaders,
            },
            body: JSON.stringify({ trader_id }),
          });
        } catch (err) {
          console.error("Failed to schedule next cycle:", err);
          await logActivity(
            trader_id,
            "error",
            `Failed to schedule next cycle: ${err instanceof Error ? err.message : "unknown"}`
          );
        }
      });
    }

    return NextResponse.json({
      ...result,
      next_cycle: shouldContinue,
    });
  } catch (e) {
    console.error("Agent cycle error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
