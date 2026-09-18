import type { PositionStatus } from "@/lib/positions/types";
import { getAssetById, type LaunchAssetName } from "@/lib/protocol/deployment";

/**
 * Presentation state for a live Position NFT.
 *
 * `pricing_unavailable` is a real answer, not a failure: a financed position
 * whose oracle is HELD or INVALID has no honest health to report, so the app
 * and the metadata route both fall back to neutral artwork instead of guessing.
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
 * Artwork thresholds on equity ratio, in basis points. These are presentation
 * only: the protocol liquidates at the 30% maintenance ratio pinned in
 * `V1Config`, and warning artwork appears well before that.
 */
const HEALTHY_MIN_EQUITY_BPS = 5_000n;
const WARNING_MIN_EQUITY_BPS = 4_000n;
const BPS_DENOMINATOR = 10_000n;

/** Committed artwork directory per launch rail. Assets without art are omitted. */
const ARTWORK_DIRECTORY: Record<LaunchAssetName, string> = {
  NVDAc: "nvda",
  AAPLc: "aapl",
  METAc: "meta",
  GOOGLc: "googl",
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

function artworkDirectory(assetId: number): string | null {
  const asset = getAssetById(assetId);
  return asset ? ARTWORK_DIRECTORY[asset.name] : null;
}

/**
 * Underlying stock symbol for NFT metadata — `NVDA`, not the `NVDAc` token name.
 * Derived from the same launch-rail map as the artwork so a trait can never name
 * a different stock than the image shows.
 */
export function stockSymbol(assetId: number): string | null {
  return artworkDirectory(assetId)?.toUpperCase() ?? null;
}

/** Public path to the committed stage artwork, or null for an unknown asset. */
export function positionArtworkPath(
  assetId: number,
  stage: PositionStage
): string | null {
  const directory = artworkDirectory(assetId);
  if (directory === null) return null;
  return stage === "pricing_unavailable"
    ? `/logos/${directory}.png`
    : `/${directory}/${stage}.png`;
}

/**
 * Ticker logo, for any surface that cannot honestly name a stage: a pending
 * Base read, a read failure, or a burn whose reason is not indexed yet.
 */
export function neutralArtworkPath(assetId: number): string | null {
  const directory = artworkDirectory(assetId);
  return directory === null ? null : `/logos/${directory}.png`;
}

/**
 * Artwork for surfaces that only have the indexed lifecycle status.
 *
 * Active and closed both stay neutral here: live health needs a Base read that
 * list pages deliberately do not make. Only `liquidated` is knowable offline.
 */
export function indexedArtworkPath(
  assetId: number,
  status: PositionStatus
): string | null {
  if (status !== "liquidated") return neutralArtworkPath(assetId);
  const directory = artworkDirectory(assetId);
  return directory === null ? null : `/${directory}/liquidated.png`;
}
