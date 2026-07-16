import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "@base-ui/react/dialog";
import { describe, expect, it } from "vitest";

import { DeskCommandStrip, HowDealsWorkBrief } from "./page";

describe("DeskCommandStrip", () => {
  it("shows the first-run desk sequence before funding", () => {
    const html = renderToStaticMarkup(
      <DeskCommandStrip
        cash={0}
        cashLoading={false}
        traderCount={0}
        portfolioLoading={false}
        dealCount={0}
        dealsLoading={false}
        approvalsCount={0}
      />
    );

    expect(html).toContain("Fund desk");
    expect(html).toContain("Required");
    expect(html).toContain("Hire trader");
    expect(html).toContain("Locked");
    expect(html).toContain("Create deal");
    expect(html).toContain("Queued");
    expect(html).toContain("Approvals");
    expect(html).toContain("Clear");
  });

  it("promotes the next action once the desk is funded and approvals are waiting", () => {
    const html = renderToStaticMarkup(
      <DeskCommandStrip
        cash={12.5}
        cashLoading={false}
        traderCount={1}
        portfolioLoading={false}
        dealCount={0}
        dealsLoading={false}
        approvalsCount={2}
      />
    );

    expect(html).toContain("$12.50");
    expect(html).toContain("Ready");
    expect(html).toContain("Roster live");
    expect(html).toContain("Next");
    expect(html).toContain("Needs call");
  });
});

describe("HowDealsWorkBrief", () => {
  it("typesets deal onboarding as a compact desk brief", () => {
    const html = renderToStaticMarkup(
      <Dialog.Root open>
        <HowDealsWorkBrief onClose={() => {}} />
      </Dialog.Root>
    );

    expect(html).toContain("Desk brief");
    expect(html).toContain("How Deals Work");
    expect(html).toContain("Pick a wire");
    expect(html).toContain("market mood + SEC heat");
    expect(html).toContain("Deal economics");
    expect(html).toContain("Sizing tactics");
    expect(html).toContain("Rule of thumb");
    expect(html).toContain("max-h-[calc(100dvh-9rem)]");
    expect(html).toContain("sm:grid-cols-3");
  });
});
