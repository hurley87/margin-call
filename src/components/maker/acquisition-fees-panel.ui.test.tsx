import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AcquisitionFeeSnapshot } from "@/lib/maker/acquisition-fees";
import { AcquisitionFeesView } from "./acquisition-fees-panel";

const SNAPSHOT: AcquisitionFeeSnapshot = {
  blockNumber: 123n,
  crystallized: 1_250_000n,
  pending: 2_500_000n,
  total: 3_750_000n,
  mockUsdBalance: 9_000_000n,
  stablecoinDecimals: 6,
  restingMakerTokenIds: [11n, 22n],
};

function renderView(
  overrides: Partial<Parameters<typeof AcquisitionFeesView>[0]> = {}
) {
  return renderToStaticMarkup(
    <AcquisitionFeesView
      snapshot={SNAPSHOT}
      phase={{ kind: "idle" }}
      isReading={false}
      isBusy={false}
      configured
      onClaim={() => undefined}
      onRefresh={() => undefined}
      {...overrides}
    />
  );
}

describe("AcquisitionFeesView", () => {
  it("shows the live stablecoin breakdown using live decimals", () => {
    const html = renderView();

    expect(html).toContain("Already crystallized");
    expect(html).toContain("1.25 MockUSD");
    expect(html).toContain("Pending across 2 resting Packs");
    expect(html).toContain("2.5 MockUSD");
    expect(html).toContain("Total claimable");
    expect(html).toContain("3.75 MockUSD");
    expect(html).toContain("Current wallet balance");
    expect(html).toContain("9 MockUSD");
  });

  it("disables claim when the refreshed live total is zero", () => {
    const html = renderView({
      snapshot: {
        ...SNAPSHOT,
        crystallized: 0n,
        pending: 0n,
        total: 0n,
        restingMakerTokenIds: [],
      },
    });

    expect(html).toContain("No Acquisition Fees are currently claimable");
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>\[CLAIM ACQUISITION FEES\]/
    );
  });

  it("shows submitted claims as pending rather than successful", () => {
    const hash = `0x${"1".repeat(64)}` as const;
    const html = renderView({ phase: { kind: "pending", hash }, isBusy: true });

    expect(html).toContain("Claim submitted — waiting for confirmation");
    expect(html).toContain("View pending transaction");
    expect(html).not.toContain("Acquisition Fee claim confirmed");
  });

  it("renders rejected and reverted claims as errors", () => {
    expect(
      renderView({
        phase: {
          kind: "error",
          message: "Transaction rejected: User rejected request",
        },
      })
    ).toContain("Transaction rejected: User rejected request");
    expect(
      renderView({
        phase: {
          kind: "error",
          message: "Acquisition Fee claim transaction reverted",
        },
      })
    ).toContain("Acquisition Fee claim transaction reverted");
  });
});
