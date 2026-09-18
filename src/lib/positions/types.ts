export type PositionStatus = "active" | "closed" | "liquidated";

export type PositionListItem = {
  tokenId: string;
  assetId: number;
  owner: string;
  status: PositionStatus;
};
