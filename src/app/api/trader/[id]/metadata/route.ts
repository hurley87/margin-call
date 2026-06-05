import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { getBaseUrl } from "@/lib/agent/auth";
import {
  buildTraderNftMetadata,
  type PublicTraderMetadataModel,
} from "@/lib/trader-metadata";
import {
  checkRateLimit,
  getClientIdentifier,
  traderLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache hints for the CDN/crawlers. On-chain tokenURIs are immutable and crawled
// by NFT indexers forever, so caching negative (404/400) responses is the main
// lever to stop dead URIs from re-querying Convex on every hit.
const NOT_FOUND_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600";
const OK_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

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

  // Public, unauthenticated route hit by external NFT indexers. Cap per-IP
  // request volume so a crawl of dead tokenURIs can't run unbounded Convex
  // queries (cost + DoS surface).
  const limited = await checkRateLimit(
    traderLimit,
    getClientIdentifier(request)
  );
  if (limited) return limited;

  try {
    const convex = createPublicConvexClient();
    const trader = (await convex.query(api.traders.getPublicMetadata, {
      traderId: id as Id<"traders">,
    })) as PublicTraderMetadataModel | null;

    if (!trader) {
      return NextResponse.json(
        { error: "Trader not found" },
        { status: 404, headers: { "Cache-Control": NOT_FOUND_CACHE_CONTROL } }
      );
    }

    return NextResponse.json(
      buildTraderNftMetadata(trader, getBaseUrl(request)),
      { headers: { "Cache-Control": OK_CACHE_CONTROL } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Invalid ID")) {
      return NextResponse.json(
        { error: "Invalid trader id" },
        { status: 400, headers: { "Cache-Control": NOT_FOUND_CACHE_CONTROL } }
      );
    }

    throw error;
  }
}
