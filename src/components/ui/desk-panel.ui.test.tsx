import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeskPanel, PanelHeader } from "@/components/ui/desk-panel";
import { GameButton } from "@/components/ui/game-button";
import { StatusChip } from "@/components/ui/status-chip";

describe("game UI primitives", () => {
  it("renders DeskPanel and PanelHeader chrome", () => {
    const html = renderToStaticMarkup(
      <DeskPanel>
        <PanelHeader title="The Wire" meta="3 OPEN DEALS" />
      </DeskPanel>
    );
    expect(html).toContain("terminal-panel");
    expect(html).toContain("The Wire");
    expect(html).toContain("3 OPEN DEALS");
  });

  it("renders GameButton primary CTA", () => {
    const html = renderToStaticMarkup(
      <GameButton onClick={() => {}}>{">"} Enter by email</GameButton>
    );
    expect(html).toContain("Enter by email");
    expect(html).toContain("border-[var(--t-accent)]");
  });

  it("renders StatusChip with live pulse affordance", () => {
    const html = renderToStaticMarkup(
      <StatusChip tone="live" pulse>
        Floor open
      </StatusChip>
    );
    expect(html).toContain("Floor open");
    expect(html).toContain("live-pulse");
  });
});
