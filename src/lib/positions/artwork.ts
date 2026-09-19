import type { PositionStatus } from "@/lib/positions/types";
import { getAssetById, type LaunchAssetName } from "@/lib/protocol/deployment";

/**
 * Presentation state for a live Position NFT.
 *
 * `pricing_unavailable` is a real answer, not a failure: a financed position
 * whose oracle is HELD or INVALID has no LIVE mark. The Stage trait still says
 * so; artwork uses the healthy dog for now so weekend/off-hours metadata does
 * not sit on the ticker logo.
 */
export type PositionStage =
  "healthy" | "warning" | "danger" | "pricing_unavailable";

export const STAGE_LABEL: Record<PositionStage, string> = {
  healthy: "Healthy",
  warning: "Warning",
  danger: "Danger",
  pricing_unavailable: "Pricing unavailable",
};

/**
 * Which committed image a surface shows.
 *
 * Distinct from `PositionStage`: a stage is a risk answer, a face is a file.
 * `neutral` is the ticker logo for surfaces that have not read live risk yet,
 * or cannot name a lifecycle reason.
 */
export type ArtworkFace =
  "healthy" | "warning" | "danger" | "liquidated" | "neutral";

/**
 * Artwork thresholds on equity ratio, in basis points. These are presentation
 * only: the protocol liquidates at the 30% maintenance ratio pinned in
 * `V1Config`, and warning artwork appears well before that.
 */
const HEALTHY_MIN_EQUITY_BPS = 5_000n;
const WARNING_MIN_EQUITY_BPS = 4_000n;
const BPS_DENOMINATOR = 10_000n;

/**
 * Committed artwork directory and metadata ticker per launch rail.
 *
 * The ticker is spelled out rather than derived from the directory: `NVDA` is
 * what a marketplace shows, and a filename is not a stock symbol.
 */
const ARTWORK: Record<LaunchAssetName, { directory: string; ticker: string }> =
  {
    NVDAc: { directory: "nvda", ticker: "NVDA" },
    AAPLc: { directory: "aapl", ticker: "AAPL" },
    METAc: { directory: "meta", ticker: "META" },
    GOOGLc: { directory: "googl", ticker: "GOOGL" },
  };

export type PositionRiskInput = {
  currentDebt: bigint;
  /** LIVE-only oracle NAV; null when pricing is HELD or INVALID. */
  nav: bigint | null;
  /** The protocol's own liquidation verdict; null when pricing is not LIVE. */
  liquidatable: boolean | null;
};

/**
 * Pure stage resolver shared by the app and the NFT metadata route.
 *
 * Deliberately takes already-fetched Base state rather than a client: both
 * callers already hold it, and a resolver that could read would invite a
 * per-card RPC fan-out.
 */
export function resolvePositionStage(input: PositionRiskInput): PositionStage {
  const { currentDebt, nav, liquidatable } = input;

  // A debt-free position cannot be unhealthy, so spot opens need no oracle.
  if (currentDebt === 0n) return "healthy";

  if (nav === null || liquidatable === null) return "pricing_unavailable";
  if (liquidatable) return "danger";

  // Zero or underwater NAV would make the ratio meaningless or negative.
  if (nav === 0n || currentDebt >= nav) return "danger";

  const equityBps = ((nav - currentDebt) * BPS_DENOMINATOR) / nav;
  if (equityBps >= HEALTHY_MIN_EQUITY_BPS) return "healthy";
  if (equityBps >= WARNING_MIN_EQUITY_BPS) return "warning";
  return "danger";
}

function artworkFor(
  assetId: number
): { directory: string; ticker: string } | null {
  const asset = getAssetById(assetId);
  return asset ? ARTWORK[asset.name] : null;
}

/**
 * Underlying stock symbol for NFT metadata — `NVDA`, not the `NVDAc` token name.
 * Comes from the same launch-rail record as the artwork so a trait can never
 * name a different stock than the image shows.
 */
export function stockSymbol(assetId: number): string | null {
  return artworkFor(assetId)?.ticker ?? null;
}

/** A stage the app has not resolved yet has no face. Unpriced still shows the dog. */
export function faceFromStage(stage: PositionStage | null): ArtworkFace {
  switch (stage) {
    case null:
      return "neutral";
    case "pricing_unavailable":
      return "healthy";
    case "healthy":
    case "warning":
    case "danger":
      return stage;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

/**
 * Face for surfaces that only have the indexed lifecycle status.
 *
 * Active and closed both stay neutral: live health needs a Base read that list
 * pages deliberately do not make. Only `liquidated` is knowable offline.
 */
export function faceFromStatus(status: PositionStatus): ArtworkFace {
  return status === "liquidated" ? "liquidated" : "neutral";
}

/** Public path to the committed artwork, or null for an unknown asset. */
export function artworkPath(assetId: number, face: ArtworkFace): string | null {
  const art = artworkFor(assetId);
  if (art === null) return null;
  return face === "neutral"
    ? `/logos/${art.directory}.png`
    : `/${art.directory}/${face}.png`;
}

/**
 * Artwork path for an asset the caller took from the curated registry.
 *
 * Every launch rail ships committed art, so a miss here is a broken build
 * rather than a UI state worth rendering a placeholder for.
 */
export function curatedArtworkPath(assetId: number, face: ArtworkFace): string {
  const path = artworkPath(assetId, face);
  if (path === null) {
    throw new Error(`No ${face} artwork for curated asset ${assetId}`);
  }
  return path;
}
