import { NextRequest, NextResponse } from "next/server";
import {
  getLatestNarrative,
  createNarrative,
  getRecentGameEvents,
} from "@/lib/supabase/queries";
import { callModel } from "@/lib/llm/call-model";
import { buildNarrativeGenerationMessages } from "@/lib/llm/messages";
import { NarrativeEpochSchema, type NarrativeEpoch } from "@/lib/llm/schemas";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch previous narrative
    const previous = await getLatestNarrative();
    const previousEpoch = previous?.epoch ?? 0;
    const nextEpoch = previousEpoch + 1;

    // 2. Collect notable game events since last epoch
    const since = previous?.created_at
      ? new Date(previous.created_at)
      : new Date(Date.now() - 5 * 60 * 1000);

    const gameEvents = await getRecentGameEvents(since);

    // 3. Generate narrative via LLM
    const messages = await buildNarrativeGenerationMessages({
      previousWorldState:
        (previous?.world_state as Record<string, unknown>) ?? null,
      previousHeadlines:
        (previous?.headlines as {
          headline: string;
          body: string;
          category: string;
        }[]) ?? [],
      gameEvents,
      epoch: nextEpoch,
    });

    const result = await callModel<NarrativeEpoch>(
      messages,
      NarrativeEpochSchema,
      "narrative_epoch"
    );

    // 4. Store the narrative epoch
    const narrative = await createNarrative({
      epoch: nextEpoch,
      headlines: result.headlines,
      world_state: result.world_state as unknown as Record<string, unknown>,
      raw_narrative: result.raw_narrative,
      events_ingested: gameEvents,
    });

    return NextResponse.json({ narrative });
  } catch (e) {
    console.error("Narrative generation error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
