import { describe, expect, it, vi } from "vitest";
import { loadPosition } from "@/lib/protocol/reads";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const EXECUTOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

function mockClient(
  impl: (functionName: string) => Promise<unknown> | unknown
) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
      impl(functionName)
    ),
  };
}

describe("loadPosition", () => {
  it("reads owner, executor, stock, debt, and LIVE risk together", async () => {
    const client = mockClient((name) => {
      switch (name) {
        case "positions":
          return {
            assetId: 3n,
            stockAmount: 1_000_000_00n,
            principal: 250_000n,
            accruedInterest: 0n,
            lastAccruedAt: 0n,
            executor: EXECUTOR,
          };
        case "currentDebt":
          return 250_000n;
        case "ownerOf":
          return OWNER;
        case "thesisOf":
          return "AI capex stays underpriced.";
        case "riskSnapshot":
          return {
            nav: 1_250_000n,
            currentDebt: 250_000n,
            liquidatable: false,
          };
        default:
          throw new Error(`unexpected ${name}`);
      }
    });

    const position = await loadPosition(client as never, 42n);

    expect(position).toEqual({
      status: "open",
      tokenId: 42n,
      assetId: 3,
      stockAmount: 1_000_000_00n,
      principal: 250_000n,
      currentDebt: 250_000n,
      owner: OWNER,
      executor: EXECUTOR,
      thesis: "AI capex stays underpriced.",
      nav: 1_250_000n,
      liquidatable: false,
    });
  });

  it("omits NAV and liquidatable when riskSnapshot is not LIVE", async () => {
    const client = mockClient((name) => {
      switch (name) {
        case "positions":
          return {
            assetId: 1n,
            stockAmount: 50n,
            principal: 10n,
            accruedInterest: 0n,
            lastAccruedAt: 0n,
            executor: "0x0000000000000000000000000000000000000000",
          };
        case "currentDebt":
          return 10n;
        case "ownerOf":
          return OWNER;
        case "thesisOf":
          return "";
        case "riskSnapshot":
          throw new Error("OracleNotLive");
        default:
          throw new Error(`unexpected ${name}`);
      }
    });

    const position = await loadPosition(client as never, 7n);

    expect(position).toMatchObject({
      status: "open",
      owner: OWNER,
      currentDebt: 10n,
      thesis: "",
      nav: null,
      liquidatable: null,
    });
  });

  it("reads a nonexistent token as burned rather than zero-debt live storage", async () => {
    const client = mockClient((name) => {
      if (name === "ownerOf") {
        throw new Error("ERC721NonexistentToken");
      }
      if (name === "positions") {
        return {
          assetId: 0n,
          stockAmount: 0n,
          principal: 0n,
          accruedInterest: 0n,
          lastAccruedAt: 0n,
          executor: "0x0000000000000000000000000000000000000000",
        };
      }
      if (name === "currentDebt") {
        return 0n;
      }
      throw new Error(`unexpected ${name}`);
    });

    // Close and liquidate both burn, so the read must not name a reason.
    await expect(loadPosition(client as never, 99n)).resolves.toEqual({
      status: "burned",
      tokenId: 99n,
    });
  });

  it("still throws when the read fails for any other reason", async () => {
    const client = mockClient((name) => {
      if (name === "ownerOf") {
        throw new Error("HTTP request failed");
      }
      if (name === "positions") {
        return {
          assetId: 1n,
          stockAmount: 50n,
          principal: 10n,
          accruedInterest: 0n,
          lastAccruedAt: 0n,
          executor: "0x0000000000000000000000000000000000000000",
        };
      }
      if (name === "currentDebt") {
        return 10n;
      }
      throw new Error(`unexpected ${name}`);
    });

    await expect(loadPosition(client as never, 99n)).rejects.toThrow(
      /HTTP request failed/
    );
  });
});
