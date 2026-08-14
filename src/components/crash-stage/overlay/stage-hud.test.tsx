// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrashTicket } from "@/lib/margin-call-crash";
import { StageHud } from "./stage-hud";

const ticket: CrashTicket = {
  id: 7n,
  player: "0x0000000000000000000000000000000000000003",
  roundId: 12n,
  margin: 1_000_000n,
  leverageBps: 12_500n,
  reservedPayout: 1_250_000n,
  settled: false,
  claimed: false,
};

describe("StageHud", () => {
  afterEach(cleanup);

  it("runs onClear when the actionable ticket chip is clicked", () => {
    const onClear = vi.fn();
    render(
      <StageHud
        clearBusy={false}
        clearLabel="Verify and settle"
        onClear={onClear}
        playerTicket={ticket}
        statusMessage={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify and settle" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("keeps a current Open entry ticket non-interactive", () => {
    render(
      <StageHud lockedInOpen playerTicket={ticket} statusMessage={null} />
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("stage-player-ticket").tagName).toBe("P");
  });

  it("disables the clear button while busy", () => {
    render(
      <StageHud
        clearBusy
        clearLabel="Refund margin"
        onClear={vi.fn()}
        playerTicket={ticket}
        statusMessage={null}
      />
    );

    expect(
      screen.getByRole("button", { name: "Refund margin" })
    ).toHaveProperty("disabled", true);
  });

  it("renders nothing when there is no ticket and no status", () => {
    const { container } = render(
      <StageHud playerTicket={null} statusMessage={null} />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("stage-hud")).toBeNull();
  });
});
