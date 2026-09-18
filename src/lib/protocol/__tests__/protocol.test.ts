import { decodeFunctionData, encodeEventTopics, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { marginCallAbi } from "@/lib/protocol/abi";
import {
  BASE_CHAIN_ID,
  DEFAULT_LEVERAGE,
  LEVERAGE_1_25X,
  ORACLE_STATE,
  SPOT_LEVERAGE,
  isFinancedLeverage,
  parseOracleState,
} from "@/lib/protocol/constants";
import {
  decodePositionClosedTokenId,
  decodePositionOpenedTokenId,
} from "@/lib/protocol/decode";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import { encodeOpenPosition } from "@/lib/protocol/encode";
import {
  isPositionManager,
  isPositionOwner,
} from "@/lib/protocol/authorization";
import { exposureLabel, liveExposure } from "@/lib/protocol/exposure";
import {
  assertBaseChain,
  closeReadiness,
  openReadiness,
  repayReadiness,
} from "@/lib/protocol/readiness";
import { repayCeiling, sizePrincipal } from "@/lib/protocol/repay";

describe("base deployment assets", () => {
  it("maps selected launch assets to the correct on-chain assetId", () => {
    expect(getAssetByName("NVDAc").assetId).toBe(1);
    expect(getAssetByName("AAPLc").assetId).toBe(2);
    expect(getAssetByName("METAc").assetId).toBe(3);
    expect(getAssetByName("GOOGLc").assetId).toBe(4);

    expect(baseDeployment.chainId).toBe(BASE_CHAIN_ID);
    expect(baseDeployment.assets).toHaveLength(4);
    expect(baseDeployment.marginCallDeployedAtBlock).toBe(51470656);
  });
});

describe("parseOracleState", () => {
  it("accepts LIVE/HELD/INVALID and rejects out-of-range", () => {
    expect(parseOracleState(0)).toBe(ORACLE_STATE.LIVE);
    expect(parseOracleState(1)).toBe(ORACLE_STATE.HELD);
    expect(parseOracleState(2)).toBe(ORACLE_STATE.INVALID);
    expect(parseOracleState(3)).toBeNull();
    expect(parseOracleState(-1)).toBeNull();
  });
});

describe("isFinancedLeverage", () => {
  it("is derived from opening presets minus spot", () => {
    expect(isFinancedLeverage(SPOT_LEVERAGE)).toBe(false);
    expect(isFinancedLeverage(LEVERAGE_1_25X)).toBe(true);
    expect(isFinancedLeverage(9_999)).toBe(false);
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

describe("decodePositionClosedTokenId", () => {
  it("captures the token ID from a PositionClosed receipt log", () => {
    const tokenId = 7n;
    const owner = "0x1234567890abcdef1234567890abcdef12345678" as const;
    const stockAmount = 1_000_000n;

    const topics = encodeEventTopics({
      abi: marginCallAbi,
      eventName: "PositionClosed",
      args: {
        tokenId,
        owner,
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

    expect(decodePositionClosedTokenId([log])).toBe(tokenId);
  });

  it("throws when PositionClosed is missing", () => {
    expect(() => decodePositionClosedTokenId([])).toThrow(
      /PositionClosed event not found/
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

  it("treats unread balance as not ready", () => {
    expect(openReadiness({ ...base, stockBalance: null })).toEqual({
      ok: false,
      reason: "Balance unread.",
    });
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
        isOwner: true,
      }).ok
    ).toBe(false);

    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: null,
        isOwner: true,
      }).ok
    ).toBe(false);

    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 0n,
        isOwner: true,
      })
    ).toEqual({ ok: true });
  });

  it("keeps Close disabled for a non-owner even at zero debt", () => {
    expect(
      closeReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 0n,
        isOwner: false,
      })
    ).toEqual({
      ok: false,
      reason: "Only the Position owner can close.",
    });
  });
});

describe("repayReadiness", () => {
  it("enables Repay all for a manager with outstanding debt", () => {
    expect(
      repayReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 100n,
        isManager: true,
      })
    ).toEqual({ ok: true });
  });

  it("disables Repay all when debt is already zero", () => {
    expect(
      repayReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 0n,
        isManager: true,
      })
    ).toEqual({
      ok: false,
      reason: "No outstanding debt.",
    });
  });

  it("disables Repay all when the wallet is not owner or executor", () => {
    expect(
      repayReadiness({
        chainId: BASE_CHAIN_ID,
        currentDebt: 100n,
        isManager: false,
      })
    ).toEqual({
      ok: false,
      reason: "Only the Position owner or executor can repay.",
    });
  });
});

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const EXECUTOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const STRANGER = "0x1111111111111111111111111111111111111111" as const;

describe("position authorization", () => {
  it("treats owner as manager and closer regardless of executor", () => {
    expect(isPositionOwner(OWNER, OWNER)).toBe(true);
    expect(isPositionManager(OWNER, OWNER, EXECUTOR)).toBe(true);
    expect(
      isPositionOwner("0x1234567890ABCDEF1234567890ABCDEF12345678", OWNER)
    ).toBe(true);
  });

  it("lets the appointed executor repay but not close", () => {
    expect(isPositionOwner(EXECUTOR, OWNER)).toBe(false);
    expect(isPositionManager(EXECUTOR, OWNER, EXECUTOR)).toBe(true);
  });

  it("ignores a zero executor and unauthorized wallets", () => {
    expect(
      isPositionManager(
        STRANGER,
        OWNER,
        "0x0000000000000000000000000000000000000000"
      )
    ).toBe(false);
    expect(isPositionManager(null, OWNER, EXECUTOR)).toBe(false);
    expect(isPositionOwner(null, OWNER)).toBe(false);
  });
});

describe("liveExposure", () => {
  it("reports 1.0x when debt is zero without needing NAV", () => {
    expect(liveExposure({ nav: null, currentDebt: 0n })).toEqual({
      kind: "unlevered",
      label: "1.0x",
    });
  });

  it("does not invent leverage when pricing is unavailable", () => {
    expect(liveExposure({ nav: null, currentDebt: 250_000n })).toEqual({
      kind: "pricing-unavailable",
    });
  });

  it("derives current leverage from LIVE NAV and debt", () => {
    expect(liveExposure({ nav: 1_250_000n, currentDebt: 250_000n })).toEqual({
      kind: "levered",
      label: "1.25x",
    });
  });

  it("does not invent leverage when equity is exhausted", () => {
    expect(liveExposure({ nav: 100n, currentDebt: 100n })).toEqual({
      kind: "equity-exhausted",
    });
  });
});

describe("exposureLabel", () => {
  it("renders a leverage row only when the number is real", () => {
    expect(exposureLabel({ kind: "unlevered", label: "1.0x" })).toBe("1.0x");
    expect(exposureLabel({ kind: "levered", label: "1.25x" })).toBe("1.25x");
    expect(exposureLabel({ kind: "equity-exhausted" })).toBe(
      "Equity exhausted"
    );
    expect(exposureLabel({ kind: "pricing-unavailable" })).toBeNull();
  });
});
