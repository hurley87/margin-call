// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  consent: { optedIn: false } as { optedIn: boolean } | undefined,
  requestMarginCall: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => sdk.consent,
  useMutation: () => sdk.requestMarginCall,
}));

import { useMarginCallVoice } from "@/hooks/use-margin-call-voice";

const WALLET = "0x1234567890123456789012345678901234567890" as const;

describe("useMarginCallVoice", () => {
  beforeEach(() => {
    sdk.consent = { optedIn: true };
    sdk.requestMarginCall.mockReset();
    sdk.requestMarginCall.mockResolvedValue({ scheduled: true });
  });

  afterEach(() => cleanup());

  it("requests once when ticket facts are present and Desk phone is on", async () => {
    const { rerender } = renderHook(
      (props: { ticketId: string | null }) =>
        useMarginCallVoice({
          ticketId: props.ticketId,
          roundId: "7",
          walletAddress: WALLET,
        }),
      { initialProps: { ticketId: null as string | null } }
    );

    expect(sdk.requestMarginCall).not.toHaveBeenCalled();

    rerender({ ticketId: "42" });

    await waitFor(() =>
      expect(sdk.requestMarginCall).toHaveBeenCalledWith({
        ticketId: "42",
        roundId: "7",
        walletAddress: WALLET,
      })
    );

    rerender({ ticketId: "42" });
    expect(sdk.requestMarginCall).toHaveBeenCalledTimes(1);
  });

  it("does not request when the Desk phone switch is off", async () => {
    sdk.consent = { optedIn: false };
    renderHook(() =>
      useMarginCallVoice({
        ticketId: "42",
        roundId: "7",
        walletAddress: WALLET,
      })
    );

    await act(async () => {});
    expect(sdk.requestMarginCall).not.toHaveBeenCalled();
  });

  it("does not request without a wallet", async () => {
    renderHook(() =>
      useMarginCallVoice({
        ticketId: "42",
        roundId: "7",
        walletAddress: null,
      })
    );

    await act(async () => {});
    expect(sdk.requestMarginCall).not.toHaveBeenCalled();
  });
});
