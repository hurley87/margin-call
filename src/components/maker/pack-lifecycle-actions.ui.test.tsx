import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildTopUpPlan } from "@/lib/maker/pack-lifecycle";
import {
  PackLifecycleView,
  type PackLifecycleReads,
} from "./pack-lifecycle-actions";

const TOKEN = "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" as const;
const VALUES = { AMZN: "1", AMD: "", NFLX: "", PLTR: "", TSLA: "" };
const READS: PackLifecycleReads = {
  isListed: true,
  isResting: true,
  basket: [{ asset: TOKEN, amount: 2_000_000_000_000_000_000n }],
  currentNav: 50_000_000_000_000_000_000n,
  minPackNav: 20_000_000_000_000_000_000n,
  poolMax: 300_000_000_000_000_000_000n,
  tokens: {
    AMZN: {
      approved: true,
      balance: 2_000_000_000_000_000_000n,
      allowance: 0n,
      quote: 25_000_000_000_000_000_000n,
    },
  },
};

function renderView(
  overrides: Partial<Parameters<typeof PackLifecycleView>[0]> = {}
) {
  const plan = buildTopUpPlan(
    [
      {
        symbol: "AMZN",
        address: TOKEN,
        decimals: 18,
        value: VALUES.AMZN,
        ...READS.tokens.AMZN,
      },
    ],
    READS.currentNav,
    READS.minPackNav,
    READS.poolMax
  );

  return renderToStaticMarkup(
    <PackLifecycleView
      tokenId={42n}
      values={VALUES}
      reads={READS}
      plan={plan}
      topUpPhase={{ kind: "idle" }}
      redemptionPhase={{ kind: "idle" }}
      topUpConfirmed={false}
      exitConfirmed={false}
      isReading={false}
      isBusy={false}
      configured
      onAmountChange={() => undefined}
      onRefresh={() => undefined}
      onTopUp={() => undefined}
      onRetrySync={() => undefined}
      onRedeem={() => undefined}
      onRetryRedeem={() => undefined}
      {...overrides}
    />
  );
}

describe("PackLifecycleView", () => {
  it("shows live basket state, additions-only projected NAV, and approval plan", () => {
    const html = renderView();

    expect(html).toContain("Listed · Resting");
    expect(html).toContain("Live basket: AMZN 2");
    expect(html).toContain("Additions-only top-up");
    expect(html).toContain("Live NAV $50.00 → projected");
    expect(html).toContain("$75.00");
    expect(html).toContain("Projected Pack remains eligible");
    expect(html).toContain("Approvals required: AMZN");
    expect(html).toContain("[TOP UP + SYNC NAV]");
  });

  it("offers sync-only recovery after a confirmed top-up", () => {
    const html = renderView({
      topUpConfirmed: true,
      topUpPhase: { kind: "error", message: "NAV sync rejected" },
    });

    expect(html).toContain("Pack #42 top-up confirmed on-chain");
    expect(html).toContain("will not be repeated");
    expect(html).toContain("[RETRY NAV SYNC]");
    expect(html).not.toContain("[TOP UP + SYNC NAV]");
  });

  it("explains zero protocol fee versus gas and resting exit ordering", () => {
    const html = renderView({
      redemptionPhase: { kind: "exiting" },
    });

    expect(html).toContain("zero redemption fee");
    expect(html).toContain("still pays Robinhood Chain gas");
    expect(html).toContain("resting Pack exits first");
    expect(html).toContain("crystallize pending fees");
  });

  it("offers redemption-only recovery after a confirmed exit", () => {
    const html = renderView({
      exitConfirmed: true,
      redemptionPhase: { kind: "error", message: "Redeem rejected" },
    });

    expect(html).toContain("Pack #42 pool exit confirmed on-chain");
    expect(html).toContain("will not be repeated");
    expect(html).toContain("[RETRY REDEMPTION]");
  });

  it("disables Maker actions when live state says the Pack is unlisted", () => {
    const html = renderView({
      reads: {
        ...READS,
        isListed: false,
        isResting: false,
      },
    });

    expect(html).toContain("Not listed");
    expect(html).toContain("no longer listed");
    expect(html).not.toContain("[TOP UP + SYNC NAV]");
  });
});
