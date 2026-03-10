import { NextRequest, NextResponse } from "next/server";
import { getNarrativeHistory } from "@/lib/supabase/queries";

export interface FeedHeadline {
  headline: string;
  body: string;
  category: string;
  epoch: number;
  created_at: string;
  mood: string;
  sec_heat: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const epochs = Math.min(Number(searchParams.get("epochs") ?? 20), 50);
    const narratives = await getNarrativeHistory(epochs);

    const feed: FeedHeadline[] = [];
    for (const n of narratives) {
      const headlines = (n.headlines ?? []) as {
        headline: string;
        body: string;
        category: string;
      }[];
      const ws = (n.world_state ?? {}) as {
        mood?: string;
        sec_heat?: number;
      };
      for (const h of headlines) {
        feed.push({
          headline: h.headline,
          body: h.body,
          category: h.category,
          epoch: n.epoch,
          created_at: n.created_at,
          mood: ws.mood ?? "unknown",
          sec_heat: ws.sec_heat ?? 0,
        });
      }
    }

    return NextResponse.json({ feed });
  } catch (e) {
    console.error("Narrative feed error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
