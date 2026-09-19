import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decodeFunctionData,
  encodeEventTopics,
  getAddress,
  toHex,
  type Log,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  fakeClient,
  livePositionReads,
  openSnapshotReads,
} from "@/lib/agent/__tests__/fake-client";
import { erc20Abi, marginCallAbi } from "@/lib/protocol/abi";
import { ORACLE_STATE } from "@/lib/protocol/constants";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import type { AgentWallet } from "@/lib/wallets/adapter";
import {
  FINANCED_DEMO_LEVERAGE,
  FINANCED_DEMO_THESIS,
  FINANCED_OPEN_PRICING_REFUSAL,
  openFinancedPosition,
  parseOpenCliArgs,
  resolveOpenStockAmount,
} from "@/lib/wallets/open-position";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" as const;
const APPROVE_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const OPEN_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const TOKEN_ID = 42n;
const STOCK_AMOUNT = 1_000_000n;
const CONTRIBUTION = 2_000_000n;
const PRINCIPAL = 495_000n;

function positionOpenedLog(tokenId: bigint, owner: `0x${string}`): Log {
  const topics = encodeEventTopics({
    abi: marginCallAbi,
    eventName: "PositionOpened",
    args: { tokenId, owner, assetId: 1n },
  }) as [`0x${string}`, ...`0x${string}`[]];

  return {
    address: baseDeployment.marginCall,
    topics,
    data: toHex(STOCK_AMOUNT, { size: 32 }),
    blockHash: "0x1" as `0x${string}`,
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: OPEN_HASH,
    transactionIndex: 0,
    removed: false,
  };
}

function liveReads() {
  return {
    ...openSnapshotReads({
      balance: STOCK_AMOUNT,
      allowance: 0n,
      contributionValue: CONTRIBUTION,
    }),
    ...livePositionReads({
      owner: ADDRESS,
      stockAmount: STOCK_AMOUNT,
      principal: PRINCIPAL,
      currentDebt: PRINCIPAL,
      thesis: FINANCED_DEMO_THESIS,
      risk: { nav: 2_495_000n, liquidatable: false },
    }),
  };
}

function fakeWallet(args?: {
  logs?: readonly Log[];
  openStatus?: "success" | "reverted";
}): AgentWallet & {
  sendTransaction: ReturnType<typeof vi.fn>;
  waitForReceipt: ReturnType<typeof vi.fn>;
} {
  const sendTransaction = vi.fn(async (tx: { to: `0x${string}` }) => {
    return getAddress(tx.to) === getAddress(baseDeployment.marginCall)
      ? OPEN_HASH
      : APPROVE_HASH;
  });
  return {
    address: ADDRESS,
    sendTransaction,
    waitForReceipt: vi.fn(async (hash: `0x${string}`) => ({
      hash,
      status: hash === OPEN_HASH ? (args?.openStatus ?? "success") : "success",
      blockNumber: 99n,
      logs:
        hash === OPEN_HASH
          ? (args?.logs ?? [positionOpenedLog(TOKEN_ID, ADDRESS)])
          : [],
    })),
  };
}

describe("openFinancedPosition", () => {
  it("refuses with PRICING_UNAVAILABLE when pricing is unavailable and opening is enabled", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.HELD,
        openingEnabled: true,
      })
    );

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result).toEqual({
      ok: false,
      code: "PRICING_UNAVAILABLE",
      message: FINANCED_OPEN_PRICING_REFUSAL,
    });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("checks market state before balance, so a weekend wallet still gets the pricing refusal", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.HELD,
        balance: 0n,
      })
    );

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "PRICING_UNAVAILABLE",
    });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not fall back to 1.0x when a financed open is refused", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(
      openSnapshotReads({ oracleState: ORACLE_STATE.INVALID })
    );

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toMatch(/1\.0x/);
    expect(result.message).toContain("will not open a leveraged position");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses with ASSET_OPENING_DISABLED when pricing is live and opening is disabled", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.LIVE,
        openingEnabled: false,
      })
    );

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "ASSET_OPENING_DISABLED",
      message: "Opening new positions is currently disabled for NVDAc.",
    });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("names the opening-disabled gate when pricing is also unavailable", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(
      openSnapshotReads({
        oracleState: ORACLE_STATE.HELD,
        openingEnabled: false,
      })
    );

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "ASSET_OPENING_DISABLED",
      message: "Opening new positions is currently disabled for NVDAc.",
    });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("quotes, prepares, submits ordinary Base txs, and reads the minted NFT", async () => {
    const wallet = fakeWallet();
    const client = fakeClient(liveReads());

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.tokenId).toBe("42");
    expect(result.asset).toBe("NVDAc");
    expect(result.leverage).toBe(FINANCED_DEMO_LEVERAGE);
    expect(result.leverageLabel).toBe("1.25x");
    expect(result.stockAmount).toBe(STOCK_AMOUNT.toString());
    expect(result.principal).toBe(PRINCIPAL.toString());
    expect(result.currentDebt).toBe(PRINCIPAL.toString());
    expect(result.thesis).toBe(FINANCED_DEMO_THESIS);
    expect(result.owner).toBe(ADDRESS);
    expect(result.transactionHashes).toEqual([APPROVE_HASH, OPEN_HASH]);

    const sent = wallet.sendTransaction.mock.calls.map(([tx]) => tx);
    expect(sent).toHaveLength(2);
    for (const tx of sent) {
      expect(Object.keys(tx).sort()).toEqual(["data", "to", "value"]);
      expect(tx.value).toBe(0n);
      expect(tx.data).toMatch(/^0x/);
    }

    expect(
      JSON.stringify(sent, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    ).not.toMatch(/dynamic/i);
    expect(
      JSON.stringify(sent, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    ).not.toMatch(/walletId/i);

    expect(
      decodeFunctionData({ abi: erc20Abi, data: sent[0]?.data ?? "0x" })
    ).toMatchObject({
      functionName: "approve",
      args: [baseDeployment.marginCall, STOCK_AMOUNT],
    });
    expect(sent[0]?.to).toBe(getAssetByName("NVDAc").stock);

    expect(
      decodeFunctionData({ abi: marginCallAbi, data: sent[1]?.data ?? "0x" })
    ).toMatchObject({
      functionName: "openPosition",
      args: [1n, STOCK_AMOUNT, 12_500n, 0n, FINANCED_DEMO_THESIS],
    });
    expect(sent[1]?.to).toBe(baseDeployment.marginCall);
  });

  it("omits the approve when allowance already covers the stock amount", async () => {
    const wallet = fakeWallet();
    const client = fakeClient({
      ...liveReads(),
      ...openSnapshotReads({
        balance: STOCK_AMOUNT,
        allowance: STOCK_AMOUNT,
        contributionValue: CONTRIBUTION,
      }),
      ...livePositionReads({
        owner: ADDRESS,
        stockAmount: STOCK_AMOUNT,
        principal: PRINCIPAL,
        currentDebt: PRINCIPAL,
        thesis: FINANCED_DEMO_THESIS,
        risk: { nav: 2_495_000n, liquidatable: false },
      }),
    });

    const result = await openFinancedPosition({
      wallet,
      client,
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result.ok).toBe(true);
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.sendTransaction.mock.calls[0]?.[0]?.to).toBe(
      baseDeployment.marginCall
    );
  });

  it("works with a bare AgentWallet that cannot sign typed data", async () => {
    const wallet = fakeWallet();
    expect("signTypedData" in wallet).toBe(false);

    const result = await openFinancedPosition({
      wallet,
      client: fakeClient(liveReads()),
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.owner).toBe(ADDRESS);
  });

  it("does not submit after a reverted open", async () => {
    const wallet = fakeWallet({ openStatus: "reverted" });
    const result = await openFinancedPosition({
      wallet,
      client: fakeClient(liveReads()),
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT,
    });

    expect(result).toMatchObject({ ok: false, code: "TX_REVERTED" });
    expect(wallet.sendTransaction).toHaveBeenCalled();
  });

  it("does not import a wallet-provider SDK", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../open-position.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/dynamic/i);
    expect(source).not.toMatch(/@dynamic-labs/);
    expect(source).not.toMatch(/uniswap/i);
  });
});

describe("parseOpenCliArgs", () => {
  it("defaults to NVDAc and the full wallet balance", () => {
    expect(parseOpenCliArgs(["--open"])).toEqual({
      requested: true,
      asset: "NVDAc",
      stockAmount: null,
    });
  });

  it("parses a human --stock amount into 8-decimal units", () => {
    expect(
      parseOpenCliArgs(["--open", "--asset", "AAPLc", "--stock", "0.01"])
    ).toEqual({
      requested: true,
      asset: "AAPLc",
      stockAmount: 1_000_000n,
    });
  });

  it("rejects a non-positive --stock", () => {
    expect(parseOpenCliArgs(["--open", "--stock", "0"]).error).toMatch(
      /--stock/
    );
  });
});

describe("resolveOpenStockAmount", () => {
  it("uses the wallet's full canonical-token balance when --stock is omitted", async () => {
    const client = fakeClient(openSnapshotReads({ balance: 5_000_000n }));
    await expect(
      resolveOpenStockAmount({
        client,
        wallet: ADDRESS,
        asset: "NVDAc",
        stockAmount: null,
      })
    ).resolves.toEqual({ ok: true, stockAmount: 5_000_000n });
  });

  it("refuses a zero balance instead of preparing an empty open", async () => {
    const client = fakeClient(openSnapshotReads({ balance: 0n }));
    await expect(
      resolveOpenStockAmount({
        client,
        wallet: ADDRESS,
        asset: "NVDAc",
        stockAmount: null,
      })
    ).resolves.toMatchObject({ ok: false, code: "INSUFFICIENT_BALANCE" });
  });
});
