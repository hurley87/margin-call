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
  optedIn: false,
  isReady: true,
  setOptedIn: vi.fn(),
}));

vi.mock("@/hooks/use-margin-call-consent", () => ({
  useMarginCallConsent: () => ({
    optedIn: sdk.optedIn,
    isReady: sdk.isReady,
    setOptedIn: sdk.setOptedIn,
  }),
}));

import { DeskPhoneSwitch } from "@/components/auth/desk-phone-switch";

const WALLET = "0x1234567890123456789012345678901234567890" as const;

describe("DeskPhoneSwitch", () => {
  beforeEach(() => {
    sdk.optedIn = false;
    sdk.isReady = true;
    sdk.setOptedIn.mockReset();
    sdk.setOptedIn.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("defaults to off and can turn calls on", async () => {
    render(<DeskPhoneSwitch walletAddress={WALLET} />);

    const button = screen.getByRole("button", { name: /Desk phone/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Calls your login number/i)).not.toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(sdk.setOptedIn).toHaveBeenCalledWith(true));
  });

  it("turns calls off when pressed while on", async () => {
    sdk.optedIn = true;
    render(<DeskPhoneSwitch walletAddress={WALLET} />);

    const button = screen.getByRole("button", { name: /Desk phone/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(sdk.setOptedIn).toHaveBeenCalledWith(false));
  });
});
