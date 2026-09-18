import { buildNftMetadata } from "@/lib/positions/nft-metadata";
import { loadPosition } from "@/lib/protocol/reads";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * `MarginCall.tokenURI` points every live Position NFT here, so this is the one
 * dynamic surface in the living-NFT design: it reads canonical Base state and
 * answers with static artwork URLs. There is no image endpoint and no
 * server-side compositing.
 *
 * Convex is deliberately not consulted. The indexer is a discovery read model,
 * and metadata must never disagree with the chain about a live position.
 */

/** `uint256` is at most 78 digits; reject padded ids so one token has one URL. */
const TOKEN_ID_RE = /^(0|[1-9]\d{0,77})$/;

/** Stage can change with the oracle, so allow a short cache but not a long one. */
const METADATA_CACHE =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/** A token id can become valid on the next mint, so absence is cached briefly. */
const MISSING_CACHE = "public, max-age=10";

function json(body: unknown, status: number, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
): Promise<Response> {
  const { tokenId } = await params;

  if (!TOKEN_ID_RE.test(tokenId)) {
    return json({ error: "Invalid token id" }, 400, MISSING_CACHE);
  }

  let position;
  try {
    position = await loadPosition(createBaseServerClient(), BigInt(tokenId));
  } catch {
    // Upstream RPC problem, not a statement about the token — never cache it.
    return json({ error: "Base is unavailable" }, 502, "no-store");
  }

  // Burned or never minted. Both are "no live token", which is what `tokenURI`
  // reverting already tells a marketplace.
  if (position.status === "burned") {
    return json(
      { error: "No live position for this token id" },
      404,
      MISSING_CACHE
    );
  }

  return json(
    buildNftMetadata({
      tokenId: position.tokenId,
      assetId: position.assetId,
      currentDebt: position.currentDebt,
      nav: position.nav,
      liquidatable: position.liquidatable,
      thesis: position.thesis,
    }),
    200,
    METADATA_CACHE
  );
}
