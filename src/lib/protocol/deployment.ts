import { ADDRESS_RE } from "@margin-call/shared/address";
import baseDeploymentJson from "../../../contracts/deployments/base.json";

export type LaunchAssetName = "NVDAc" | "AAPLc" | "METAc" | "GOOGLc";

export type LaunchAsset = {
  name: LaunchAssetName;
  assetId: number;
  stock: `0x${string}`;
  oracleAdapter: `0x${string}`;
  executionAdapter: `0x${string}`;
};

export type BaseDeployment = {
  chainId: number;
  marginCall: `0x${string}`;
  creditPool: `0x${string}`;
  usdc: `0x${string}`;
  assets: readonly LaunchAsset[];
};

function asAddress(value: string, label: string): `0x${string}` {
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`Invalid ${label} address in base.json: ${value}`);
  }
  return value as `0x${string}`;
}

function parseAsset(raw: {
  name: string;
  assetId: number;
  stock: string;
  oracleAdapter: string;
  executionAdapter: string;
}): LaunchAsset {
  const name = raw.name as LaunchAssetName;
  if (
    name !== "NVDAc" &&
    name !== "AAPLc" &&
    name !== "METAc" &&
    name !== "GOOGLc"
  ) {
    throw new Error(`Unexpected launch asset name: ${raw.name}`);
  }
  return {
    name,
    assetId: raw.assetId,
    stock: asAddress(raw.stock, `${name}.stock`),
    oracleAdapter: asAddress(raw.oracleAdapter, `${name}.oracleAdapter`),
    executionAdapter: asAddress(
      raw.executionAdapter,
      `${name}.executionAdapter`
    ),
  };
}

function parseDeployment(raw: typeof baseDeploymentJson): BaseDeployment {
  if (raw.chainId !== 8453) {
    throw new Error(`Expected Base chainId 8453, got ${raw.chainId}`);
  }
  if (!raw.canonical) {
    throw new Error("base.json must be marked canonical");
  }

  const assets = raw.assets.map(parseAsset);
  if (assets.length !== 4) {
    throw new Error(`Expected 4 launch assets, got ${assets.length}`);
  }

  return {
    chainId: raw.chainId,
    marginCall: asAddress(raw.contracts.marginCall, "marginCall"),
    creditPool: asAddress(raw.contracts.creditPool, "creditPool"),
    usdc: asAddress(raw.shared.usdc, "usdc"),
    assets,
  };
}

/** Canonical multi-stock Base launch deployment (issue #446). */
export const baseDeployment: BaseDeployment =
  parseDeployment(baseDeploymentJson);

export function getAssetById(assetId: number): LaunchAsset | null {
  return (
    baseDeployment.assets.find((asset) => asset.assetId === assetId) ?? null
  );
}

export function getAssetByName(name: LaunchAssetName): LaunchAsset {
  const asset = baseDeployment.assets.find((entry) => entry.name === name);
  if (!asset) {
    throw new Error(`Unknown launch asset: ${name}`);
  }
  return asset;
}
