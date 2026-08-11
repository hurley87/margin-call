// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RoundHistoryDetail,
  RoundHistoryItem,
} from "@/lib/margin-call-crash";

const sdk = vi.hoisted(() => {
  const finalized: RoundHistoryItem = {
    round: {
      id: 3n,
      openAt: 1_000n,
      lockAt: 1_045n,
      expiresAt: 1_945n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe",
      crashPointBps: 34_200n,
      totalMargin: 5_000_000n,
      reservedPayout: 6_250_000n,
      status: 3,
    },
    phase: "finalized",
    historyState: "finalized",
    displayCrashPoint: "3.42x",
  };
  const delayed: RoundHistoryItem = {
    round: {
      id: 4n,
      openAt: 2_000n,
      lockAt: 2_045n,
      expiresAt: 2_945n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000beef",
      crashPointBps: 0n,
      totalMargin: 1_000_000n,
      reservedPayout: 1_250_000n,
      status: 2,
    },
    phase: "reveal-requested",
    historyState: "delayed",
    displayCrashPoint: null,
  };
  const expired: RoundHistoryItem = {
    round: {
      id: 2n,
      openAt: 500n,
      lockAt: 545n,
      expiresAt: 1_445n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000dead",
      crashPointBps: 0n,
      totalMargin: 1_000_000n,
      reservedPayout: 1_250_000n,
      status: 4,
    },
    phase: "expired",
    historyState: "expired",
    displayCrashPoint: null,
  };
  const detail: RoundHistoryDetail = {
    ...finalized,
    openingTransactionUrl:
      "https://sepolia.basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    revealTransactionUrl:
      "https://sepolia.basescan.org/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    finalizeTransactionUrl:
      "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    expireTransactionUrl: null,
    gameContractUrl:
      "https://sepolia.basescan.org/address/0x0000000000000000000000000000000000000001#code",
    incoContractUrl:
      "https://sepolia.basescan.org/address/0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624#code",
    ticketEnteredTransactionUrls: [
      "https://sepolia.basescan.org/tx/0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    ],
    ticketClaimedTransactionUrls: [],
    ticketRefundedTransactionUrls: [],
  };
  return {
    view: {
      status: "ready" as const,
      rounds: [delayed, finalized, expired],
      selectedRoundId: null as bigint | null,
      detail: null as RoundHistoryDetail | null,
      detailStatus: "idle" as "idle" | "loading" | "ready" | "error",
      selectRound: vi.fn(),
      clearSelection: vi.fn(),
      retry: vi.fn(),
    },
    detail,
  };
});

vi.mock("@/hooks/use-global-history", () => ({
  useGlobalHistory: () => sdk.view,
}));

import { GlobalHistory } from "./global-history";

describe("GlobalHistory", () => {
  beforeEach(() => {
    sdk.view.selectedRoundId = null;
    sdk.view.detail = null;
    sdk.view.detailStatus = "idle";
    sdk.view.selectRound.mockReset();
    sdk.view.clearSelection.mockReset();
  });

  afterEach(cleanup);

  it("shows honest delayed and expired states without inventing multipliers", () => {
    render(<GlobalHistory />);

    expect(screen.getByText("Round 4")).toBeTruthy();
    expect(screen.getByText("Delayed")).toBeTruthy();
    expect(screen.getByText("Awaiting attestation")).toBeTruthy();
    expect(screen.getByText("3.42x")).toBeTruthy();
    expect(screen.getByText("Expired — no result")).toBeTruthy();
    expect(screen.queryByText("0.00x")).toBeNull();
  });

  it("expands a verification record with BaseScan lifecycle links", () => {
    sdk.view.selectedRoundId = 3n;
    sdk.view.detail = sdk.detail;
    sdk.view.detailStatus = "ready";
    render(<GlobalHistory />);

    expect(screen.getByText(/Verification record · Round 3/)).toBeTruthy();
    expect(screen.getByText(/Encrypted handle/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View finalization transaction" })
        .getAttribute("href")
    ).toBe(sdk.detail.finalizeTransactionUrl);
    expect(
      screen
        .getByRole("link", { name: "View entry transaction" })
        .getAttribute("href")
    ).toBe(sdk.detail.ticketEnteredTransactionUrls[0]);
  });

  it("selects a round when its row is activated", () => {
    render(<GlobalHistory />);
    fireEvent.click(screen.getByRole("button", { name: /Round 3/i }));
    expect(sdk.view.selectRound).toHaveBeenCalledWith(3n);
  });
});
