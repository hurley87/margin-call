import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildPackPlan } from "@/lib/maker/pack-composer";
import { PackComposerView, type ChainReads } from "./pack-composer";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const VALUES = { AMZN: "1", AMD: "", NFLX: "", PLTR: "", TSLA: "" };
const READS: ChainReads = {
  tokens: {
    AMZN: {
      balance: 2_000_000_000_000_000_000n,
      allowance: 0n,
      quote: 25_000_000_000_000_000_000n,
    },
  },
  minPackNav: 20_000_000_000_000_000_000n,
  poolMax: 300_000_000_000_000_000_000n,
};

function renderView(
  overrides: Partial<Parameters<typeof PackComposerView>[0]> = {}
) {
  const rows = [
    {
      symbol: "AMZN",
      address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" as const,
      decimals: 18,
      value: VALUES.AMZN,
      ...READS.tokens.AMZN,
    },
  ];
  return renderToStaticMarkup(
    <PackComposerView
      walletAddress={WALLET}
      values={VALUES}
      reads={READS}
      plan={buildPackPlan(rows, READS.minPackNav, READS.poolMax)}
      phase={{ kind: "idle" }}
      mintedTokenId={null}
      isReading={false}
      isBusy={false}
      configured
      onAmountChange={() => undefined}
      onRefresh={() => undefined}
      onSubmit={() => undefined}
      onRetryEnrollment={() => undefined}
      onComposeAnother={() => undefined}
      {...overrides}
    />
  );
}

describe("PackComposerView", () => {
  it("renders canonical Stock Tokens, inventory funding guidance, live band, and allowance plan", () => {
    const html = renderView();

    expect(html).toContain("Compose a Pack");
    for (const symbol of ["AMZN", "AMD", "NFLX", "PLTR", "TSLA"]) {
      expect(html).toContain(symbol);
    }
    expect(html).toContain("Starter Grant is MockUSD");
    expect(html).toContain("does not fund Maker Stock Token inventory");
    expect(html).toContain("https://faucet.testnet.chain.robinhood.com");
    expect(html).toContain("Quoted basket NAV");
    expect(html).toContain("$25.00");
    expect(html).toContain("$20.00");
    expect(html).toContain("$300.00");
    expect(html).toContain("Inside eligibility band");
    expect(html).toContain("Approvals required: AMZN");
  });

  it("shows confirmed mint and enrollment success", () => {
    const html = renderView({
      phase: { kind: "complete", tokenId: 42n },
      mintedTokenId: 42n,
    });

    expect(html).toContain("Pack #42 minted and enrolled");
    expect(html).toContain("[COMPOSE ANOTHER PACK]");
    expect(html).not.toContain("RETRY POOL ENROLLMENT");
  });

  it("offers recoverable enrollment after a confirmed mint without suggesting rollback", () => {
    const html = renderView({
      phase: { kind: "error", message: "Transaction rejected" },
      mintedTokenId: 77n,
    });

    expect(html).toContain("Pack #77 was confirmed on-chain");
    expect(html).toContain("not rolled back and will not be reminted");
    expect(html).toContain("[RETRY POOL ENROLLMENT]");
  });

  it("labels an accepted mint hash as pending instead of success", () => {
    const html = renderView({
      phase: { kind: "mint-pending", hash: `0x${"1".repeat(64)}` },
      isBusy: true,
    });

    expect(html).toContain("Pack mint submitted — waiting for confirmation");
    expect(html).toContain("View pending transaction");
    expect(html).not.toContain("minted and enrolled");
  });
});
