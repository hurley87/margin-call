import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TraderDeskSummaryStrip } from "./trader-detail";

describe("TraderDeskSummaryStrip", () => {
  it("clarifies a funded active trader's decision state", () => {
    const html = renderToStaticMarkup(
      <TraderDeskSummaryStrip
        status="active"
        balanceUsdc={275.25}
        unfunded={false}
        onOpenWallet={() => {}}
      />
    );

    expect(html).toContain("Desk order");
    expect(html).toContain("Autonomous");
    expect(html).toContain("Cash at risk");
    expect(html).toContain("$275.25");
    expect(html).toContain("Mandate driven");
    expect(html).toContain("sm:grid-cols-3");
  });

  it("onboards an unfunded paused trader toward wallet funding", () => {
    const html = renderToStaticMarkup(
      <TraderDeskSummaryStrip
        status="paused"
        balanceUsdc={0}
        unfunded
        onOpenWallet={() => {}}
      />
    );

    expect(html).toContain("Standing by");
    expect(html).toContain("$0.00");
    expect(html).toContain("Fund first");
    expect(html).toContain("text-[var(--t-amber)]");
  });
});
