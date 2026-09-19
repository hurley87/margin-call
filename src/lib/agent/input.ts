import { getAddress } from "viem";
import { ADDRESS_RE } from "@margin-call/shared/address";
import { MAX_THESIS_BYTES, thesisByteLength } from "@margin-call/shared/thesis";
import { agentError, type Parsed } from "@/lib/agent/result";
import {
  OPENING_LEVERAGE_PRESETS,
  isSupportedOpeningLeverage,
} from "@/lib/protocol/constants";
import {
  baseDeployment,
  getAssetById,
  type LaunchAsset,
} from "@/lib/protocol/deployment";

/**
 * Callers name an asset either way round: `assetId` is what the contract takes,
 * `asset` is what a model is likely to have in hand from `get_assets`. When
 * both arrive, `assetId` wins — it is the unambiguous one.
 *
 * Typed `unknown` because these arrive from a JSON body or a query string that
 * no transport has validated yet; `parseAssetSelector` is where they narrow.
 */
export type AssetSelector = {
  asset?: unknown;
  assetId?: unknown;
};

/** `uint256` is at most 78 digits; reject padding so one token has one id. */
const TOKEN_ID_RE = /^(0|[1-9]\d{0,77})$/;

const ASSET_NAMES = baseDeployment.assets.map((asset) => asset.name).join(", ");

const LEVERAGE_BPS = OPENING_LEVERAGE_PRESETS.map((preset) => preset.bps);

/** Whole, non-negative integers only — JSON floats never become base units. */
function toBigInt(value: unknown): bigint | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return BigInt(trimmed);
  }
  return null;
}

export function parseAssetSelector(
  selector: AssetSelector
): Parsed<LaunchAsset> {
  const { asset, assetId } = selector;

  if (assetId != null && assetId !== "") {
    const id = toBigInt(assetId);
    if (id == null || id > BigInt(Number.MAX_SAFE_INTEGER)) {
      return agentError("INVALID_INPUT", "assetId must be a positive integer.");
    }
    const match = getAssetById(Number(id));
    if (match == null) {
      return agentError(
        "UNKNOWN_ASSET",
        `No launch asset with assetId ${id}. Call get_assets for the supported set.`
      );
    }
    return { ok: true, value: match };
  }

  if (typeof asset === "string" && asset.trim() !== "") {
    const wanted = asset.trim().toUpperCase();
    const match = baseDeployment.assets.find(
      (candidate) => candidate.name.toUpperCase() === wanted
    );
    if (match == null) {
      return agentError(
        "UNKNOWN_ASSET",
        `Unknown asset "${asset}". Supported: ${ASSET_NAMES}.`
      );
    }
    return { ok: true, value: match };
  }

  return agentError(
    "INVALID_INPUT",
    `Provide an asset. Use assetId, or one of: ${ASSET_NAMES}.`
  );
}

/** Stock amounts are raw 8-decimal base units, never a human "1.5". */
export function parseStockAmountRaw(value: unknown): Parsed<bigint> {
  const amount = toBigInt(value);
  if (amount == null) {
    return agentError(
      "INVALID_INPUT",
      "stockAmount must be a whole number of base units, as a decimal string."
    );
  }
  if (amount === 0n) {
    return agentError(
      "INVALID_INPUT",
      "stockAmount must be greater than zero."
    );
  }
  return { ok: true, value: amount };
}

export function parseLeverage(value: unknown): Parsed<number> {
  const leverage = toBigInt(value);
  if (leverage == null || leverage > BigInt(Number.MAX_SAFE_INTEGER)) {
    return agentError(
      "INVALID_INPUT",
      "leverage must be an integer in basis points, for example 12500."
    );
  }
  const bps = Number(leverage);
  if (!isSupportedOpeningLeverage(bps)) {
    return agentError(
      "UNSUPPORTED_LEVERAGE",
      `Unsupported leverage ${bps}. Supported presets: ${LEVERAGE_BPS.join(", ")}.`
    );
  }
  return { ok: true, value: bps };
}

export function parseWallet(value: unknown): Parsed<`0x${string}`> {
  if (typeof value !== "string" || !ADDRESS_RE.test(value.trim())) {
    return agentError(
      "INVALID_INPUT",
      "wallet must be a 0x-prefixed 20-byte Base address."
    );
  }
  try {
    return { ok: true, value: getAddress(value.trim()) };
  } catch {
    return agentError(
      "INVALID_INPUT",
      "wallet has an invalid address checksum."
    );
  }
}

/**
 * The thesis is optional and immutable once minted. The contract measures
 * UTF-8 bytes, so a long emoji note can fail a check a character count passes.
 */
export function parseThesis(value: unknown): Parsed<string> {
  if (value == null) return { ok: true, value: "" };
  if (typeof value !== "string") {
    return agentError("INVALID_INPUT", "thesis must be a string.");
  }
  const length = thesisByteLength(value);
  if (length > MAX_THESIS_BYTES) {
    return agentError(
      "THESIS_TOO_LONG",
      `thesis is ${length} UTF-8 bytes; the contract accepts at most ${MAX_THESIS_BYTES}.`
    );
  }
  return { ok: true, value };
}

export function parseTokenId(value: unknown): Parsed<bigint> {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !TOKEN_ID_RE.test(raw.trim())) {
    return agentError(
      "INVALID_INPUT",
      "tokenId must be a uint256 decimal string."
    );
  }
  return { ok: true, value: BigInt(raw.trim()) };
}
