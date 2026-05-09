import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { getBaseUrl } from "@/lib/agent/auth";
import {
  buildTraderNftMetadata,
  type PublicTraderMetadataModel,
} from "@/lib/trader-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createPublicConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Add it to your environment."
    );
  }
  return new ConvexHttpClient(url);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const convex = createPublicConvexClient();
    const trader = (await convex.query(api.traders.getPublicMetadata, {
      traderId: id as Id<"traders">,
    })) as PublicTraderMetadataModel | null;

    if (!trader) {
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }

    return NextResponse.json(
      buildTraderNftMetadata(trader, getBaseUrl(request))
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Invalid ID")) {
      return NextResponse.json({ error: "Invalid trader id" }, { status: 400 });
    }

    throw error;
  }
}
