import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DealMetricGrid } from "./deal-detail";

describe("DealMetricGrid", () => {
  it("uses four desktop columns when the deal has no creator fee", () => {
    const html = renderToStaticMarkup(
      <DealMetricGrid
        displayPotUsdc={1250}
        entryCostUsdc={50}
        entryCount={7}
        wipeoutCount={0}
      />
    );

    expect(html).toContain("sm:grid-cols-4");
    expect(html).not.toContain(">Fee<");
    expect(html).toContain("Pot");
    expect(html).toContain("Entry");
    expect(html).toContain("Entries");
    expect(html).toContain("Wipeouts");
  });

  it("adapts to five columns and red wipeout state when a fee is present", () => {
    const html = renderToStaticMarkup(
      <DealMetricGrid
        displayPotUsdc={2500}
        entryCostUsdc={100}
        feeUsdc={10}
        entryCount={12}
        wipeoutCount={3}
      />
    );

    expect(html).toContain("sm:grid-cols-5");
    expect(html).toContain(">Fee<");
    expect(html).toContain("$10");
    expect(html).toContain("text-[var(--t-red)]");
  });
});
