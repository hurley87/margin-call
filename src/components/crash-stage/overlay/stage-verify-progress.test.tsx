// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SettlementTransaction,
  useCrashTicketSettlement,
} from "@/hooks/use-crash-ticket-settlement";
import { StageVerifyProgress } from "./stage-verify-progress";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    status: "attesting",
    error: null,
    walletAddress: "0x0000000000000000000000000000000000000003",
    ticket: {
      id: 7n,
      player: "0x0000000000000000000000000000000000000003",
      roundId: 12n,
      margin: 5_000_000n,
      leverageBps: 20_000n,
      reservedPayout: 10_000_000n,
      settled: false,
      claimed: false,
    },
    round: null,
    outcome: "pending",
    payout: 10_000_000n,
    phase: "locked",
    displayCrashPoint: null,
    canVerify: false,
    canClaim: false,
    canSettle: false,
    canRetry: false,
    retryAction: null,
    transactions: [],
    verifyAndSettle: vi.fn(),
    claim: vi.fn(),
    settleLoss: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
    refreshIfIdle: vi.fn(),
    ...overrides,
  } as Settlement;
}

const revealTx: SettlementTransaction = {
  stage: "reveal",
  hash: "0xaaa1",
  url: "https://sepolia.basescan.org/tx/0xaaa1",
  confirmed: true,
};

afterEach(cleanup);

describe("StageVerifyProgress", () => {
  it("marks earlier steps done and the attest step active while attesting", () => {
    render(
      <StageVerifyProgress
        onCancel={vi.fn()}
        settlement={makeSettlement({
          status: "attesting",
          transactions: [revealTx],
        })}
      />
    );

    expect(
      screen.getByTestId("verify-step-reveal").getAttribute("data-state")
    ).toBe("done");
    expect(
      screen.getByTestId("verify-step-attest").getAttribute("data-state")
    ).toBe("active");
    expect(
      screen.getByTestId("verify-step-finalize").getAttribute("data-state")
    ).toBe("upcoming");
    expect(
      screen.getByTestId("verify-step-settle").getAttribute("data-state")
    ).toBe("upcoming");
  });

  it("links each recorded transaction to BaseScan", () => {
    render(
      <StageVerifyProgress
        onCancel={vi.fn()}
        settlement={makeSettlement({
          status: "claim-pending",
          transactions: [
            revealTx,
            {
              stage: "claim",
              hash: "0xbbb2",
              url: "https://sepolia.basescan.org/tx/0xbbb2",
              confirmed: false,
            },
          ],
        })}
      />
    );

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "https://sepolia.basescan.org/tx/0xaaa1",
      "https://sepolia.basescan.org/tx/0xbbb2",
    ]);
    expect(links[1]!.textContent).toContain("tx pending");
    // Claim/settle transactions render under the settle step.
    expect(
      screen.getByTestId("verify-step-settle").getAttribute("data-state")
    ).toBe("active");
  });

  it("shows the error on the failed step with retry and a way back", () => {
    const onCancel = vi.fn();
    const settlement = makeSettlement({
      status: "error",
      error: "We couldn't finalize your round. Please try again.",
      canRetry: true,
      retryAction: "verify",
      transactions: [revealTx],
    });
    render(<StageVerifyProgress onCancel={onCancel} settlement={settlement} />);

    // Reveal already confirmed, so a generic verify retry points at attest.
    expect(
      screen.getByTestId("verify-step-attest").getAttribute("data-state")
    ).toBe("failed");
    expect(screen.getByRole("alert").textContent).toContain(
      "couldn't finalize"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry verify and settle" })
    );
    expect(settlement.retry).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Back to the Floor" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("marks every step done once confirmed", () => {
    render(
      <StageVerifyProgress
        onCancel={vi.fn()}
        settlement={makeSettlement({ status: "confirmed" })}
      />
    );
    for (const step of ["reveal", "attest", "finalize", "settle"]) {
      expect(
        screen.getByTestId(`verify-step-${step}`).getAttribute("data-state")
      ).toBe("done");
    }
  });
});
