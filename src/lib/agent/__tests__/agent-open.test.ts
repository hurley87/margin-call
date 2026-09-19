import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  decodeFunctionData,
  encodeErrorResult,
} from "viem";
import { describe, expect, it } from "vitest";
import { prepareOpen } from "@/lib/agent/prepare-open";
import { quoteOpen } from "@/lib/agent/quote-open";
import type { AgentOk, AgentResult } from "@/lib/agent/result";
import { erc20Abi, marginCallAbi } from "@/lib/protocol/abi";
import { ORACLE_STATE } from "@/lib/protocol/constants";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import {
  fakeClient,
  openSnapshotReads,
  type ReadHandlers,
} from "@/lib/agent/__tests__/fake-client";

const WALLET = "0x1234567890AbcdEF1234567890aBcdef12345678";

/** A $2 contribution at 1.25x sizes to 495000 after the adverse-bound haircut. */
const CONTRIBUTION = 2_000_000n;
const PRINCIPAL = 495_000n;
const STOCK_AMOUNT = 1_000_000n;

function expectOk<T>(result: AgentResult<T>): AgentOk<T> {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  }
  return result;
}

function quoteReads(
  overrides: {
    oracleState?: 0 | 1 | 2;
    availableCredit?: bigint;
    contributionValue?: bigint;
  } = {}
): ReadHandlers {
  return openSnapshotReads({
    oracleState: overrides.oracleState ?? ORACLE_STATE.LIVE,
    availableCredit: overrides.availableCredit ?? 20_000_000n,
    contributionValue: overrides.contributionValue ?? CONTRIBUTION,
  });
}

/** An `openPosition` revert shaped the way viem surfaces one from a dry run. */
function openRevert(data: `0x${string}`): Error {
  return new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: marginCallAbi,
      data,
      functionName: "openPosition",
    }),
    {
      abi: marginCallAbi,
      functionName: "openPosition",
      args: [1n, STOCK_AMOUNT, 12_500n, 0n, ""],
      contractAddress: baseDeployment.marginCall,
    }
  );
}

describe("quote_open", () => {
  it("sizes a financed open from live pricing without needing a wallet", async () => {
    const client = fakeClient(quoteReads());

    const quote = expectOk(
      await quoteOpen(client, {
        asset: "NVDAc",
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
      })
    );

    expect(quote).toMatchObject({
      asset: "NVDAc",
      leverage: 12_500,
      leverageLabel: "1.25x",
      financed: true,
      pricing: "live",
      canOpen: true,
      contributionValue: "2000000",
      estimatedPrincipal: "495000",
      estimatedExposure: "2495000",
      availableCredit: "20000000",
    });
  });

  it.each([
    ["held", ORACLE_STATE.HELD],
    ["invalid", ORACLE_STATE.INVALID],
  ])(
    "refuses to size a financed open against %s pricing instead of using a stale price",
    async (_label, oracleState) => {
      const client = fakeClient(quoteReads({ oracleState }));

      const quote = await quoteOpen(client, {
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
      });

      expect(quote).toMatchObject({
        ok: false,
        code: "PRICING_UNAVAILABLE",
      });
      expect(quote.ok).toBe(false);
      if (!quote.ok) {
        expect(quote.message).toContain("Fresh U.S. equity pricing");
      }
    }
  );

  it("still quotes a spot open while pricing is unavailable, borrowing nothing", async () => {
    const client = fakeClient(quoteReads({ oracleState: ORACLE_STATE.HELD }));

    const quote = expectOk(
      await quoteOpen(client, {
        asset: "NVDAc",
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 10_000,
      })
    );

    expect(quote).toMatchObject({
      financed: false,
      pricing: "unavailable",
      canOpen: true,
      estimatedPrincipal: "0",
      contributionValue: null,
    });
  });

  it("refuses when the pool cannot fund the principal, naming both figures", async () => {
    const client = fakeClient(quoteReads({ availableCredit: 100_000n }));

    const quote = await quoteOpen(client, {
      asset: "NVDAc",
      stockAmount: STOCK_AMOUNT.toString(),
      leverage: 12_500,
    });

    expect(quote).toMatchObject({ ok: false, code: "INSUFFICIENT_CREDIT" });
    if (!quote.ok) {
      expect(quote.message).toContain("0.495");
      expect(quote.message).toContain("0.1");
    }
  });

  it("refuses a contribution too small to finance at all", async () => {
    const client = fakeClient(quoteReads({ contributionValue: 3n }));

    await expect(
      quoteOpen(client, { asset: "NVDAc", stockAmount: "1", leverage: 12_500 })
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rejects a leverage the protocol does not offer", async () => {
    const client = fakeClient(quoteReads());

    for (const leverage of [12_000, 20_000, 0]) {
      await expect(
        quoteOpen(client, {
          asset: "NVDAc",
          stockAmount: STOCK_AMOUNT.toString(),
          leverage,
        })
      ).resolves.toMatchObject({ ok: false, code: "UNSUPPORTED_LEVERAGE" });
    }
  });

  it("rejects a stock amount that is not whole base units", async () => {
    const client = fakeClient(quoteReads());

    for (const stockAmount of ["0", "1.5", "-1", "abc", 1.5]) {
      await expect(
        quoteOpen(client, { asset: "NVDAc", stockAmount, leverage: 12_500 })
      ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
  });
});

describe("prepare_open", () => {
  it("returns an unsigned approve and open pair when allowance is short", async () => {
    const client = fakeClient(quoteReads());

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
        thesis: "AI infrastructure demand remains strong",
      })
    );

    expect(prepared.transactions.map((tx) => tx.kind)).toEqual([
      "approve",
      "open",
    ]);
    for (const tx of prepared.transactions) {
      expect(tx).toMatchObject({ value: "0", chainId: 8453 });
      expect(tx.data.startsWith("0x")).toBe(true);
      expect(tx.description.length).toBeGreaterThan(0);
    }
    expect(prepared).toMatchObject({
      wallet: WALLET,
      estimatedPrincipal: PRINCIPAL.toString(),
      financed: true,
      pricing: "live",
    });
  });

  it("encodes the approve against MarginCall for exactly the requested amount", async () => {
    const client = fakeClient(quoteReads());

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
      })
    );
    const approve = prepared.transactions.find((tx) => tx.kind === "approve");

    expect(approve?.to).toBe(getAssetByName("NVDAc").stock);
    expect(
      decodeFunctionData({ abi: erc20Abi, data: approve?.data ?? "0x" })
    ).toMatchObject({
      functionName: "approve",
      args: [baseDeployment.marginCall, STOCK_AMOUNT],
    });
  });

  it("encodes the canonical five-argument openPosition against MarginCall", async () => {
    const client = fakeClient(quoteReads());

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
        thesis: "Agent-opened",
      })
    );
    const open = prepared.transactions.find((tx) => tx.kind === "open");

    expect(open?.to).toBe(baseDeployment.marginCall);
    expect(
      decodeFunctionData({ abi: marginCallAbi, data: open?.data ?? "0x" })
    ).toMatchObject({
      functionName: "openPosition",
      args: [1n, STOCK_AMOUNT, 12_500n, 0n, "Agent-opened"],
    });
  });

  it("omits the approve and dry-runs the open when allowance already covers it", async () => {
    const client = fakeClient(
      openSnapshotReads({
        allowance: STOCK_AMOUNT,
        contributionValue: CONTRIBUTION,
      })
    );

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
      })
    );

    expect(prepared.transactions.map((tx) => tx.kind)).toEqual(["open"]);
    expect(prepared.transactions[0]?.simulated).toBe(true);
  });

  it("flags the open as unsimulated when an approve must land first", async () => {
    const client = fakeClient(quoteReads());

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
      })
    );

    expect(
      prepared.transactions.find((tx) => tx.kind === "open")?.simulated
    ).toBe(false);
  });

  it("refuses to prepare a financed open when pricing is unavailable", async () => {
    const client = fakeClient(quoteReads({ oracleState: ORACLE_STATE.HELD }));

    const prepared = await prepareOpen(client, {
      wallet: WALLET,
      assetId: 1,
      stockAmount: STOCK_AMOUNT.toString(),
      leverage: 12_500,
    });

    expect(prepared).toMatchObject({ ok: false, code: "PRICING_UNAVAILABLE" });
    expect(prepared).not.toHaveProperty("transactions");
  });

  it("prepares a spot open while pricing is unavailable, without consulting the oracle", async () => {
    const client = fakeClient(
      openSnapshotReads({
        allowance: STOCK_AMOUNT,
        oracleState: ORACLE_STATE.HELD,
      })
    );

    const prepared = expectOk(
      await prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 10_000,
      })
    );

    expect(prepared).toMatchObject({
      financed: false,
      pricing: null,
      estimatedPrincipal: "0",
    });
  });

  it("refuses when the wallet does not hold the stock it wants to deposit", async () => {
    const client = fakeClient(quoteReads());

    await expect(
      prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: "999999999999",
        leverage: 12_500,
      })
    ).resolves.toMatchObject({ ok: false, code: "INSUFFICIENT_BALANCE" });
  });

  it.each([
    [
      "OracleNotLive",
      encodeErrorResult({
        abi: marginCallAbi,
        errorName: "OracleNotLive",
        args: [1],
      }),
      "PRICING_UNAVAILABLE",
    ],
    [
      "InsufficientCredit",
      encodeErrorResult({
        abi: marginCallAbi,
        errorName: "InsufficientCredit",
        args: [495_000n, 1n],
      }),
      "INSUFFICIENT_CREDIT",
    ],
    [
      "ContributionTooSmall",
      encodeErrorResult({
        abi: marginCallAbi,
        errorName: "ContributionTooSmall",
        args: [1n],
      }),
      "INVALID_INPUT",
    ],
    [
      "LeverageExceeded",
      encodeErrorResult({
        abi: marginCallAbi,
        errorName: "LeverageExceeded",
        args: [12_500n, 1n, 1n],
      }),
      "SIMULATION_FAILED",
    ],
  ])(
    "translates a %s simulation revert into a code an agent can act on",
    async (_name, data, code) => {
      const client = fakeClient(
        openSnapshotReads({
          allowance: STOCK_AMOUNT,
          contributionValue: CONTRIBUTION,
        }),
        {
          simulate: () => {
            throw openRevert(data);
          },
        }
      );

      await expect(
        prepareOpen(client, {
          wallet: WALLET,
          assetId: 1,
          stockAmount: STOCK_AMOUNT.toString(),
          leverage: 12_500,
        })
      ).resolves.toMatchObject({ ok: false, code });
    }
  );

  it("reports an unrecognised simulation failure without leaking revert data", async () => {
    const client = fakeClient(
      openSnapshotReads({
        allowance: STOCK_AMOUNT,
        contributionValue: CONTRIBUTION,
      }),
      {
        simulate: () => {
          throw new Error("execution reverted: 0xdeadbeefdeadbeef");
        },
      }
    );

    const prepared = await prepareOpen(client, {
      wallet: WALLET,
      assetId: 1,
      stockAmount: STOCK_AMOUNT.toString(),
      leverage: 12_500,
    });

    expect(prepared).toMatchObject({ ok: false, code: "SIMULATION_FAILED" });
    if (!prepared.ok) {
      expect(prepared.message).not.toContain("0xdeadbeef");
    }
  });

  it("rejects a thesis longer than the contract accepts before touching Base", async () => {
    const client = fakeClient({});

    await expect(
      prepareOpen(client, {
        wallet: WALLET,
        assetId: 1,
        stockAmount: STOCK_AMOUNT.toString(),
        leverage: 12_500,
        thesis: "x".repeat(281),
      })
    ).resolves.toMatchObject({ ok: false, code: "THESIS_TOO_LONG" });
  });

  it("rejects a wallet that is not a Base address", async () => {
    const client = fakeClient({});

    for (const wallet of ["", "0x123", "not-an-address", null]) {
      await expect(
        prepareOpen(client, {
          wallet,
          assetId: 1,
          stockAmount: STOCK_AMOUNT.toString(),
          leverage: 12_500,
        })
      ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
  });
});
