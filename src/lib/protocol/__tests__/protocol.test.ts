import { decodeFunctionData, encodeEventTopics, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { marginCallAbi } from "@/lib/protocol/abi";
import {
  BASE_CHAIN_ID,
  DEFAULT_LEVERAGE,
  LEVERAGE_1_25X,
  ORACLE_STATE,
  SPOT_LEVERAGE,
} from "@/lib/protocol/constants";
import { decodePositionOpenedTokenId } from "@/lib/protocol/decode";
import {
  assetIdForName,
  baseDeployment,
  getAssetByName,
} from "@/lib/protocol/deployment";
import { encodeOpenPosition } from "@/lib/protocol/encode";
import {
  assertBaseChain,
  closeReadiness,
  openReadiness,
} from "@/lib/protocol/readiness";
import { repayCeiling, sizePrincipal } from "@/lib/protocol/repay";

describe("base deployment assets", () => {
  it("maps selected launch assets to the correct on-chain assetId", () => {
    expect(assetIdForName("NVDAc")).toBe(1);
    expect(assetIdForName("AAPLc")).toBe(2);
    expect(assetIdForName("METAc")).toBe(3);
    expect(assetIdForName("GOOGLc")).toBe(4);

    expect(getAssetByName("NVDAc").assetId).toBe(1);
    expect(baseDeployment.chainId).toBe(BASE_CHAIN_ID);
    expect(baseDeployment.assets).toHaveLength(4);
  });
});

describe("assertBaseChain", () => {
  it("rejects wrong-chain writes", () => {
    expect(assertBaseChain(1).ok).toBe(false);
    expect(assertBaseChain(null).ok).toBe(false);
    expect(assertBaseChain(BASE_CHAIN_ID)).toEqual({ ok: true });
  });
});

describe("encodeOpenPosition", () => {
  it("encodes openPosition(assetId, amount, leverage, 0)", () => {
    const data = encodeOpenPosition({
      assetId: 1n,
      stockAmount: 1_000_000n,
      targetLeverage: BigInt(DEFAULT_LEVERAGE),
    });

    const decoded = decodeFunctionData({
      abi: marginCallAbi,
      data,
    });

    expect(decoded.functionName).toBe("openPosition");
    expect(decoded.args).toEqual([1n, 1_000_000n, BigInt(LEVERAGE_1_25X), 0n]);
  });
});

describe("decodePositionOpenedTokenId", () => {
  it("captures the token ID from a PositionOpened receipt log", () => {
    const tokenId = 42n;
    const owner = "0x1234567890abcdef1234567890abcdef12345678" as const;
    const assetId = 1n;
    const stockAmount = 1_246_919n;

    const topics = encodeEventTopics({
      abi: marginCallAbi,
      eventName: "PositionOpened",
      args: {
        tokenId,
        owner,
        assetId,
      },
    }) as [`0x${string}`, ...`0x${string}`[]];

    const log = {
      address: baseDeployment.marginCall,
      topics,
      data: toHex(stockAmount, { size: 32 }),
      blockHash: "0x" as `0x${string}`,
      blockNumber: 1n,
      logIndex: 0,
      transactionHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    };

    expect(decodePositionOpenedTokenId([log])).toBe(tokenId);
  });

  it("throws when PositionOpened is missing", () => {
    expect(() => decodePositionOpenedTokenId([])).toThrow(
      /PositionOpened event not found/
    );
  });
});

describe("repayCeiling", () => {
  it("adds the 1% buffer plus 1 raw USDC unit", () => {
    // remaining = 546900 → ceiling = 546900 + 5469 + 1 = 552370
    expect(repayCeiling(546_900n)).toBe(552_370n);
    expect(repayCeiling(0n)).toBe(0n);
    expect(repayCeiling(100n)).toBe(100n + 1n + 1n);
  });
});

describe("sizePrincipal", () => {
  it("sizes financed principal with the adverse bound haircut", () => {
    // contributionValue=10000, leverage=12500 → ideal=2500 → *9900/10000 = 2475
    expect(sizePrincipal(10_000n, LEVERAGE_1_25X)).toBe(2_475n);
    expect(sizePrincipal(10_000n, SPOT_LEVERAGE)).toBe(0n);
  });
});

describe("openReadiness", () => {
  const base = {
    chainId: BASE_CHAIN_ID,
    stockAmount: 1_000_000n,
    stockBalance: 2_000_000n,
    targetLeverage: LEVERAGE_1_25X,
    oracleState: ORACLE_STATE.LIVE,
    availableCredit: 10_000_000n,
    estimatedPrincipal: 500_000n,
  } as const;

  it("disables financed open on the wrong chain", () => {
    expect(openReadiness({ ...base, chainId: 1 }).ok).toBe(false);
  });

  it("allows spot open without LIVE/credit gates", () => {
    expect(
      openReadiness({
        ...base,
        targetLeverage: SPOT_LEVERAGE,
        oracleState: ORACLE_STATE.HELD,
        availableCredit: null,
        estimatedPrincipal: null,
      })
    ).toEqual({ ok: true });
  });

  it("requires LIVE oracle and credit for financed opens", () => {
    expect(openReadiness({ ...base, oracleState: ORACLE_STATE.HELD }).ok).toBe(
      false
    );
    expect(
      openReadiness({
        ...base,
        availableCredit: 100n,
        estimatedPrincipal: 500_000n,
      }).ok
    ).toBe(false);
    expect(openReadiness(base)).toEqual({ ok: true });
  });
});

describe("closeReadiness", () => {
  it("keeps Close disabled until a re-read reports zero debt", () => {
    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 100n,
        positionExists: true,
      }).ok
    ).toBe(false);

    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: null,
        positionExists: true,
      }).ok
    ).toBe(false);

    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 0n,
        positionExists: true,
      })
    ).toEqual({ ok: true });
  });
});
