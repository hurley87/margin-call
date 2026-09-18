export type PositionStatus = "active" | "closed" | "liquidated";

export type PositionListItem = {
  tokenId: string;
  assetId: number;
  owner: string;
  status: PositionStatus;
  /** Close/liquidate transaction — only indexed once the token is terminal. */
  terminalTxHash?: string;
};

export const STATUS_LABEL: Record<PositionStatus, string> = {
  active: "Active",
  closed: "Closed",
  liquidated: "Liquidated",
};

/**
 * Valid-by-construction args for `api.positions.allPositions`.
 * Convex requires status when assetId is set — illegal combos cannot exist.
 */
export type AllPositionsFilter =
  | { status?: undefined; assetId?: undefined }
  | { status: PositionStatus; assetId?: undefined }
  | { status: PositionStatus; assetId: number };
