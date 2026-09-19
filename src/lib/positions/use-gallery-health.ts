"use client";

import { useEffect, useState } from "react";
import type { PositionStage } from "@/lib/positions/artwork";
import {
  parseNftMetadata,
  stageFromMetadata,
  type NftMetadata,
} from "@/lib/positions/nft-metadata";
import type { PositionListItem } from "@/lib/positions/types";

export type GalleryHealth = PositionStage | "unavailable" | "ended";
export type GalleryNft = { health: GalleryHealth; metadata?: NftMetadata };

async function loadGalleryNft(
  tokenId: string,
  signal: AbortSignal
): Promise<GalleryNft> {
  try {
    const response = await fetch(`/api/nft/${tokenId}`, { signal });
    if (response.status === 404) return { health: "ended" };
    if (!response.ok) return { health: "unavailable" };
    const metadata = parseNftMetadata(await response.json());
    if (metadata === null) return { health: "unavailable" };
    return {
      health: stageFromMetadata(metadata) ?? "unavailable",
      metadata,
    };
  } catch {
    return { health: "unavailable" };
  }
}

/**
 * Bounded Explore refresh against the same `tokenURI` metadata marketplaces cache.
 *
 * Explore-only by design. Each token costs the metadata route five Base reads,
 * so this stays behind the gallery rather than any shared list component.
 */
export function useGalleryHealth(positions: PositionListItem[]) {
  const ids = positions
    .filter((position) => position.status === "active")
    .map((position) => position.tokenId)
    .sort()
    .join(",");
  const [snapshot, setSnapshot] = useState<{
    ids: string;
    health: Record<string, GalleryNft>;
  }>({ ids: "", health: {} });

  useEffect(() => {
    if (!ids) return;
    const tokens = ids.split(",");
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      let next = 0;
      async function worker() {
        while (!cancelled && next < tokens.length) {
          const tokenId = tokens[next++];
          const result = await loadGalleryNft(tokenId, controller.signal);
          if (cancelled) return;
          setSnapshot((previous) => ({
            ids,
            health: {
              ...(previous.ids === ids ? previous.health : {}),
              [tokenId]: result,
            },
          }));
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(3, tokens.length) }, worker)
      );
      if (!cancelled) timer = setTimeout(refresh, 60_000);
    }
    void refresh();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [ids]);

  return snapshot.ids === ids ? snapshot.health : {};
}
