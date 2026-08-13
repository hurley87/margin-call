// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  consent: { optedIn: false } as { optedIn: boolean } | undefined,
  setConsent: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => sdk.consent,
  useMutation: () => sdk.setConsent,
}));

import { DeskPhoneSwitch } from "@/components/auth/desk-phone-switch";

const WALLET = "0x1234567890123456789012345678901234567890" as const;

describe("DeskPhoneSwitch", () => {
  beforeEach(() => {
    sdk.consent = { optedIn: false };
    sdk.setConsent.mockReset();
    sdk.setConsent.mockResolvedValue(null);
  });

  afterEach(() => cleanup());

  it("defaults to off and can turn calls on", async () => {
    render(<DeskPhoneSwitch walletAddress={WALLET} />);

    const button = screen.getByRole("button", { name: /Desk phone/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/Calls your login number/i)).toBeNull();

    fireEvent.click(button);
    await waitFor(() =>
      expect(sdk.setConsent).toHaveBeenCalledWith({
        optedIn: true,
        walletAddress: WALLET,
      })
    );
  });

  it("turns calls off when pressed while on", async () => {
    sdk.consent = { optedIn: true };
    render(<DeskPhoneSwitch walletAddress={WALLET} />);

    const button = screen.getByRole("button", { name: /Desk phone/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() =>
      expect(sdk.setConsent).toHaveBeenCalledWith({
        optedIn: false,
        walletAddress: WALLET,
      })
    );
  });

  it("surfaces update failures without the default hint", async () => {
    sdk.setConsent.mockRejectedValue(new Error("nope"));
    render(<DeskPhoneSwitch walletAddress={WALLET} />);

    fireEvent.click(screen.getByRole("button", { name: /Desk phone/i }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn’t update/)).not.toBeNull()
    );
    expect(screen.queryByText(/Calls your login number/i)).toBeNull();
  });
});
