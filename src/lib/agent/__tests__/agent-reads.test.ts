import { describe, expect, it } from "vitest";
import { getAssets } from "@/lib/agent/assets";
import { getCreditPool } from "@/lib/agent/credit-pool";
import { getMarketState } from "@/lib/agent/market-state";
import { getPosition } from "@/lib/agent/position";
import { ERC721_NONEXISTENT_TOKEN } from "@/lib/protocol/abi";
import { ORACLE_STATE } from "@/lib/protocol/constants";
import { baseDeployment } from "@/lib/protocol/deployment";
import {
  fakeClient,
  livePositionReads,
  openSnapshotReads,
} from "@/lib/agent/__tests__/fake-client";

describe("get_assets", () => {
  it("discovers every launch asset and the canonical contracts without a wallet or an RPC", () => {
    const assets = getAssets();

    expect(assets.ok).toBe(true);
    expect(assets.chainId).toBe(8453);
    expect(assets.assets.map((asset) => asset.name)).toEqual([
      "NVDAc",
      "AAPLc",
      "METAc",
      "GOOGLc",
    ]);
    expect(assets.assets.map((asset) => asset.assetId)).toEqual([1, 2, 3, 4]);
    expect(assets.contracts).toEqual({
      marginCall: baseDeployment.marginCall,
      creditPool: baseDeployment.creditPool,
      usdc: baseDeployment.usdc,
    });
  });

  it("names the underlying stock alongside the Base token", () => {
    const nvda = getAssets().assets.find((asset) => asset.assetId === 1);

    expect(nvda).toMatchObject({ name: "NVDAc", symbol: "NVDA" });
  });

  it("publishes the supported leverage presets and which of them borrow", () => {
    const presets = getAssets().leveragePresets;

    expect(presets.map((preset) => preset.bps)).toEqual([
      10_000, 11_000, 12_500, 14_000, 15_000,
    ]);
    expect(presets.find((preset) => preset.bps === 10_000)?.financed).toBe(
      false
    );
    expect(presets.find((preset) => preset.bps === 12_500)?.financed).toBe(
      true
    );
  });
});

describe("get_market_state", () => {
  it("reports live pricing as openable for leverage when opening is enabled", async () => {
    const client = fakeClient(
      openSnapshotReads({ oracleState: ORACLE_STATE.LIVE })
    );

    const state = await getMarketState(client, { asset: "NVDAc" });

    expect(state).toMatchObject({
      ok: true,
      asset: "NVDAc",
      assetId: 1,
      pricing: "live",
      openingEnabled: true,
      canOpenLeveragedPosition: true,
    });
    expect(state).not.toHaveProperty("reason");
  });

  it.each([
    ["held", ORACLE_STATE.HELD],
    ["invalid", ORACLE_STATE.INVALID],
  ])(
    "collapses %s pricing into one unavailable answer with a plain reason",
    async (_label, state) => {
      const client = fakeClient(openSnapshotReads({ oracleState: state }));

      const market = await getMarketState(client, { assetId: 1 });

      expect(market).toMatchObject({
        ok: true,
        pricing: "unavailable",
        openingEnabled: true,
        canOpenLeveragedPosition: false,
        reason: "Fresh U.S. equity pricing is unavailable.",
      });
      expect(JSON.stringify(market)).not.toContain("HELD");
      expect(JSON.stringify(market)).not.toContain("INVALID");
    }
  );

  it("keeps live pricing but refuses leverage when the asset is closed to new opens", async () => {
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.LIVE,
        openingEnabled: false,
      })
    );

    const state = await getMarketState(client, { asset: "NVDAc" });

    expect(state).toMatchObject({
      ok: true,
      pricing: "live",
      openingEnabled: false,
      canOpenLeveragedPosition: false,
      reason: "Opening new positions is currently disabled for NVDAc.",
    });
  });

  it("names the opening-disabled gate when pricing is also unavailable", async () => {
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.HELD,
        openingEnabled: false,
      })
    );

    await expect(
      getMarketState(client, { asset: "NVDAc" })
    ).resolves.toMatchObject({
      ok: true,
      pricing: "unavailable",
      openingEnabled: false,
      canOpenLeveragedPosition: false,
      reason: "Opening new positions is currently disabled for NVDAc.",
    });
  });

  it("accepts either an asset name or an assetId", async () => {
    const client = fakeClient(openSnapshotReads());

    await expect(
      getMarketState(client, { asset: "googlc" })
    ).resolves.toMatchObject({ asset: "GOOGLc", assetId: 4 });
    await expect(
      getMarketState(client, { assetId: "3" })
    ).resolves.toMatchObject({ asset: "METAc" });
  });

  it("rejects an asset the protocol does not list", async () => {
    const client = fakeClient({});

    await expect(
      getMarketState(client, { asset: "TSLAc" })
    ).resolves.toMatchObject({ ok: false, code: "UNKNOWN_ASSET" });
    await expect(
      getMarketState(client, { assetId: 99 })
    ).resolves.toMatchObject({
      ok: false,
      code: "UNKNOWN_ASSET",
    });
  });

  it("reports an RPC failure as transport trouble, not as stale pricing", async () => {
    const client = fakeClient({
      latestObservation: () => {
        throw new Error("fetch failed");
      },
      assetConfig: () => ({ openingEnabled: true }),
    });

    await expect(
      getMarketState(client, { asset: "NVDAc" })
    ).resolves.toMatchObject({ ok: false, code: "BASE_UNAVAILABLE" });
  });
});

describe("get_credit_pool", () => {
  it("reports lendable credit in base units and whole USDC", async () => {
    const client = fakeClient({ availableCredit: () => 20_000_000n });

    await expect(getCreditPool(client)).resolves.toMatchObject({
      ok: true,
      availableCredit: "20000000",
      availableCreditUsdc: "20",
      token: baseDeployment.usdc,
      decimals: 6,
    });
  });

  it("surfaces an empty pool as zero rather than as an error", async () => {
    const client = fakeClient({ availableCredit: () => 0n });

    await expect(getCreditPool(client)).resolves.toMatchObject({
      ok: true,
      availableCredit: "0",
    });
  });
});

describe("get_position", () => {
  it("reads a live financed position with its health from Base", async () => {
    const client = fakeClient(
      livePositionReads({
        assetId: 1,
        stockAmount: 1_247_489n,
        principal: 550_365n,
        currentDebt: 560_000n,
        thesis: "AI infrastructure demand remains strong",
        risk: { nav: 1_400_000n, liquidatable: false },
      })
    );

    await expect(getPosition(client, { tokenId: "42" })).resolves.toMatchObject(
      {
        ok: true,
        tokenId: "42",
        asset: "NVDAc",
        symbol: "NVDA",
        stockAmount: "1247489",
        principal: "550365",
        currentDebt: "560000",
        thesis: "AI infrastructure demand remains strong",
        nav: "1400000",
        liquidatable: false,
        pricing: "live",
        stage: "healthy",
      }
    );
  });

  it("omits NAV instead of guessing it when pricing is unavailable", async () => {
    const client = fakeClient(
      livePositionReads({ currentDebt: 560_000n, risk: "unavailable" })
    );

    await expect(getPosition(client, { tokenId: "42" })).resolves.toMatchObject(
      {
        ok: true,
        nav: null,
        liquidatable: null,
        pricing: "unavailable",
        stage: "pricing_unavailable",
      }
    );
  });

  it("reports a burned or never-minted token as not found", async () => {
    const client = fakeClient({
      positions: () => {
        throw new Error(ERC721_NONEXISTENT_TOKEN);
      },
    });

    await expect(getPosition(client, { tokenId: "9" })).resolves.toMatchObject({
      ok: false,
      code: "POSITION_NOT_FOUND",
    });
  });

  it("rejects a token id that is not a plain uint256", async () => {
    const client = fakeClient({});

    for (const tokenId of ["007", "-1", "1.5", "0x2a", ""]) {
      await expect(getPosition(client, { tokenId })).resolves.toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
      });
    }
  });
});
