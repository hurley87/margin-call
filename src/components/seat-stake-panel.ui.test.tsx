import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SeatStakePanelStatic } from "./seat-stake-panel";
import { SeatTierBadgeView } from "./seat-tier-badge";

describe("SeatTierBadgeView", () => {
  it("renders floor tier labels", () => {
    const html = renderToStaticMarkup(
      <SeatTierBadgeView tier="CornerOffice" syncStatus="ok" />
    );
    expect(html).toContain("Corner Office");
    expect(html).not.toContain("yield");
    expect(html).not.toContain("reward");
  });

  it("surfaces sync lag without private amounts", () => {
    const html = renderToStaticMarkup(
      <SeatTierBadgeView tier="Seat" syncStatus="syncing" compact />
    );
    expect(html).toContain("Seat");
    expect(html).toContain("syncing");
    expect(html).not.toContain("Pending");
    expect(html).not.toContain("Complete withdrawal");
  });
});

describe("SeatStakePanelStatic", () => {
  it("shows owner controls and next-tier principal need", () => {
    const html = renderToStaticMarkup(
      <SeatStakePanelStatic
        tier="Gallery"
        activeHuman="2500"
        pendingHuman="0"
        nextTierDeltaHuman="7500"
        nextTierLabel="Seat"
        showControls
        showPendingDetails={false}
      />
    );

    expect(html).toContain("Floor seat");
    expect(html).toContain("Post $BLOW");
    expect(html).toContain("File pull");
    expect(html).toContain("Need 7500 $BLOW for Seat");
    expect(html).not.toContain("yield");
    expect(html).not.toContain("dividend");
    expect(html).not.toContain("payout");
  });

  it("hides management from non-owners while keeping public tier", () => {
    const html = renderToStaticMarkup(
      <SeatStakePanelStatic
        tier="Seat"
        activeHuman="10000"
        pendingHuman="5000"
        showControls={false}
        showPendingDetails={false}
      />
    );

    expect(html).toContain("Seat");
    expect(html).toContain("Public view — management locked");
    expect(html).not.toContain("Post $BLOW");
    expect(html).not.toContain("Pending 5000");
    expect(html).not.toContain("Complete withdrawal");
  });

  it("surfaces pending withdrawal + cooldown for owners across vault versions", () => {
    const locked = renderToStaticMarkup(
      <SeatStakePanelStatic
        tier="Gallery"
        activeHuman="0"
        pendingHuman="4000"
        showControls
        showPendingDetails
        cooldownLabel="Unlock 2h 00m 00s"
        canComplete={false}
        vaultVersionLabel="Vault v1 · prior book · no capacity"
      />
    );

    expect(locked).toContain("Pending 4000 $BLOW");
    expect(locked).toContain("Unlock 2h 00m 00s");
    expect(locked).toContain("Cage locked");
    expect(locked).toContain("prior book · no capacity");
    expect(locked).not.toContain("Complete withdrawal");

    const ready = renderToStaticMarkup(
      <SeatStakePanelStatic
        tier="Gallery"
        activeHuman="0"
        pendingHuman="4000"
        showControls
        showPendingDetails
        cooldownLabel="Ready"
        canComplete
        vaultVersionLabel="Vault v2"
      />
    );
    // Ready path enables the complete button (no disabled attr on that control).
    expect(ready).toContain("Complete withdrawal");
    expect(ready).not.toContain("Cage locked");
  });

  it("renders actionable tx failure copy", () => {
    const html = renderToStaticMarkup(
      <SeatStakePanelStatic
        tier="Gallery"
        activeHuman="0"
        pendingHuman="0"
        showControls
        showPendingDetails={false}
        error="Insufficient $BLOW on the desk — wire more chips before posting."
      />
    );
    expect(html).toContain("Insufficient $BLOW");
    expect(html).toContain('role="alert"');
  });
});
