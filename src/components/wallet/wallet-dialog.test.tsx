// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  transfer: vi.fn(),
  retry: vi.fn(),
  status: "idle" as string,
  error: null as string | null,
  lastHash: null as string | null,
  canTransfer: true,
  canRetry: false,
}));

vi.mock("@/hooks/use-desk-dollars-transfer", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/use-desk-dollars-transfer")
  >("@/hooks/use-desk-dollars-transfer");
  return {
    ...actual,
    useDeskDollarsTransfer: () => ({
      status: sdk.status,
      error: sdk.error,
      lastHash: sdk.lastHash,
      canTransfer: sdk.canTransfer,
      canRetry: sdk.canRetry,
      transfer: sdk.transfer,
      retry: sdk.retry,
    }),
  };
});

vi.mock("@/components/desk-dollars/desk-dollars-faucet", () => ({
  DeskDollarsFaucet: () => null,
}));

import { WalletDialog } from "./wallet-dialog";

const FROM = "0x0000000000000000000000000000000000000003" as const;
const TO = "0x0000000000000000000000000000000000000004" as const;

describe("WalletDialog", () => {
  beforeEach(() => {
    sdk.transfer.mockReset().mockResolvedValue(true);
    sdk.retry.mockReset().mockResolvedValue(true);
    sdk.status = "idle";
    sdk.error = null;
    sdk.lastHash = null;
    sdk.canTransfer = true;
    sdk.canRetry = false;
  });

  afterEach(cleanup);

  it("requires confirm before submitting a transfer and preserves input on cancel", async () => {
    render(
      <WalletDialog
        balance={100_000_000n}
        decimals={6}
        onOpenChange={vi.fn()}
        open
        walletAddress={FROM}
      />
    );

    expect(screen.getByTestId("wallet-dialog-address").textContent).toBe(FROM);
    expect(screen.getByText("100 USDC")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Recipient"), {
      target: { value: TO },
    });
    fireEvent.change(screen.getByLabelText("Amount (USDC)"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send USDC" }));

    expect(sdk.transfer).not.toHaveBeenCalled();
    expect(screen.getByTestId("transaction-confirm")).not.toBeNull();
    expect(screen.getByText(TO)).not.toBeNull();
    expect(screen.getByText("10 USDC")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((screen.getByLabelText("Recipient") as HTMLInputElement).value).toBe(
      TO
    );
    expect(
      (screen.getByLabelText("Amount (USDC)") as HTMLInputElement).value
    ).toBe("10");

    fireEvent.click(screen.getByRole("button", { name: "Send USDC" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send USDC" }));

    await waitFor(() =>
      expect(sdk.transfer).toHaveBeenCalledWith({
        recipient: TO,
        amount: "10",
        balance: 100_000_000n,
      })
    );
  });

  it("fills the amount field from Max", () => {
    render(
      <WalletDialog
        balance={12_500_000n}
        decimals={6}
        onOpenChange={vi.fn()}
        open
        walletAddress={FROM}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(
      (screen.getByLabelText("Amount (USDC)") as HTMLInputElement).value
    ).toBe("12.5");
  });

  it("retries when the transfer hook reports a retryable error", async () => {
    sdk.status = "error";
    sdk.error =
      "Your transfer was submitted, but we couldn't confirm it yet. Retry to check its status.";
    sdk.canRetry = true;
    sdk.canTransfer = false;

    render(
      <WalletDialog
        balance={100_000_000n}
        decimals={6}
        onOpenChange={vi.fn()}
        open
        walletAddress={FROM}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(sdk.retry).toHaveBeenCalledTimes(1));
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
});
