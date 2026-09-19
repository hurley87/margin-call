import type { AgentOk } from "@/lib/agent/result";
import { stockSymbol } from "@/lib/positions/artwork";
import {
  OPENING_LEVERAGE_PRESETS,
  SPOT_LEVERAGE,
  STOCK_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/protocol/constants";
import {
  baseDeployment,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";

export type AgentAsset = {
  /** Token name on Base, e.g. `NVDAc`. */
  name: LaunchAssetName;
  /** Underlying stock, e.g. `NVDA`. What a model is likely to reason about. */
  symbol: string;
  assetId: number;
  stock: `0x${string}`;
  oracleAdapter: `0x${string}`;
  executionAdapter: `0x${string}`;
};

export type AgentLeveragePreset = {
  label: string;
  bps: number;
  /** Spot draws no credit, so it stays openable while pricing is stale. */
  financed: boolean;
};

export type AgentAssetsPayload = {
  chainId: number;
  network: "base";
  contracts: {
    marginCall: `0x${string}`;
    creditPool: `0x${string}`;
    usdc: `0x${string}`;
  };
  decimals: { stock: number; usdc: number };
  leveragePresets: readonly AgentLeveragePreset[];
  assets: readonly AgentAsset[];
};

/**
 * The curated launch set and the addresses every other tool resolves against.
 *
 * Reads no chain state: the deployment manifest is the canonical answer, and an
 * agent should be able to discover the protocol before it can reach an RPC.
 */
export function getAssets(): AgentOk<AgentAssetsPayload> {
  return {
    ok: true,
    chainId: baseDeployment.chainId,
    network: "base",
    contracts: {
      marginCall: baseDeployment.marginCall,
      creditPool: baseDeployment.creditPool,
      usdc: baseDeployment.usdc,
    },
    decimals: { stock: STOCK_DECIMALS, usdc: USDC_DECIMALS },
    leveragePresets: OPENING_LEVERAGE_PRESETS.map((preset) => ({
      label: preset.label,
      bps: preset.bps,
      financed: preset.bps !== SPOT_LEVERAGE,
    })),
    assets: baseDeployment.assets.map((asset) => ({
      name: asset.name,
      symbol: stockSymbol(asset.assetId) ?? asset.name,
      assetId: asset.assetId,
      stock: asset.stock,
      oracleAdapter: asset.oracleAdapter,
      executionAdapter: asset.executionAdapter,
    })),
  };
}
