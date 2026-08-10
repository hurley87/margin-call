// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type VaultFixture = {
  status:
    | "unavailable"
    | "loading"
    | "ready"
    | "approval-submitting"
    | "approval-pending"
    | "deposit-submitting"
    | "deposit-pending"
    | "confirmed"
    | "error";
  error: string | null;
  canDeposit: boolean;
  canRetry: boolean;
  tUsdBalance: bigint;
  shareBalance: bigint;
  assetsPerShare: bigint;
  grossAssets: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
  pendingObligations: bigint;
  unrecognizedMargin: bigint;
  deposit: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

const sdk = vi.hoisted(() => {
  const ready = (): VaultFixture => ({
    status: "ready",
    error: null,
    canDeposit: true,
    canRetry: false,
    tUsdBalance: 123450000n,
    shareBalance: 50000000n,
    assetsPerShare: 1000000n,
    grossAssets: 25000000000n,
    totalAssets: 25000000000n,
    totalSupply: 25000000000n,
    pendingObligations: 0n,
    unrecognizedMargin: 0n,
    deposit: vi.fn(),
    retry: vi.fn(),
  });
  return { vault: ready(), ready };
});

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: {
      wallet: {
        address: "0x0000000000000000000000000000000000000003",
        chainType: "ethereum",
        walletClientType: "privy",
      },
    },
  }),
}));
vi.mock("@/hooks/use-bankroll-vault-deposit", () => ({
  useBankrollVaultDeposit: () => sdk.vault,
}));

import { LpDesk } from "./lp-desk";

beforeEach(() => {
  sdk.vault = sdk.ready();
});
afterEach(() => cleanup());

describe("LpDesk", () => {
  it("shows the authenticated wallet and meaningful pre-game vault accounting", () => {
    render(<LpDesk />);
    expect(
      screen.getByText("Wallet Desk Dollars").nextElementSibling?.textContent
    ).toBe("123.45 tUSD");
    expect(
      screen.getByText("Wallet vault shares").nextElementSibling?.textContent
    ).toBe("50 vault shares");
    expect(
      screen.getByText("Share price (assets per share)").nextElementSibling
        ?.textContent
    ).toBe("1 tUSD");
    expect(
      screen.getByText("Gross assets").nextElementSibling?.textContent
    ).toBe("25000 tUSD");
    expect(
      screen.getByText(
        /vault-share value can decline as game results are realized/i
      )
    ).not.toBeNull();
    expect(screen.getByText(/Base Sepolia/)).not.toBeNull();
  });

  it("validates an exact six-decimal asset amount against the wallet balance", () => {
    render(<LpDesk />);
    const input = screen.getByLabelText("LP deposit amount (tUSD)");
    fireEvent.change(input, { target: { value: "1.0000001" } });
    expect(screen.getByText(/no more than 6 decimal places/)).not.toBeNull();
    fireEvent.change(input, { target: { value: "124" } });
    expect(screen.getByText(/cannot exceed/)).not.toBeNull();
    fireEvent.change(input, { target: { value: "12.345678" } });
    fireEvent.submit(input.closest("form")!);
    expect(sdk.vault.deposit).toHaveBeenCalledWith(12345678n);
    expect(
      screen.getByText(/never requests unlimited approval/)
    ).not.toBeNull();
  });

  it("reports pending receipt states without optimistic share changes", () => {
    sdk.vault = { ...sdk.vault, status: "deposit-pending", canDeposit: false };
    render(<LpDesk />);
    expect(
      screen.getByText(/pending until its Base Sepolia receipt succeeds/)
    ).not.toBeNull();
    expect(
      screen.getByText(/will not update until confirmation/)
    ).not.toBeNull();
    expect(
      screen.getByText("Wallet vault shares").nextElementSibling?.textContent
    ).toBe("50 vault shares");
  });

  it("renders approval, confirmation, safe retry, and unavailable configuration states", () => {
    const { rerender } = render(<LpDesk />);
    sdk.vault = { ...sdk.vault, status: "approval-pending", canDeposit: false };
    rerender(<LpDesk />);
    expect(screen.getByText(/Exact tUSD approval pending/)).not.toBeNull();
    sdk.vault = { ...sdk.vault, status: "confirmed", canDeposit: false };
    rerender(<LpDesk />);
    expect(screen.getByText(/LP deposit confirmed/)).not.toBeNull();
    sdk.vault = {
      ...sdk.vault,
      status: "error",
      error: "confirmed but refresh failed",
      canRetry: true,
      canDeposit: false,
    };
    rerender(<LpDesk />);
    expect(screen.getByRole("alert").textContent).toContain(
      "confirmed but refresh failed"
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(sdk.vault.retry).toHaveBeenCalledOnce();
    sdk.vault = {
      ...sdk.vault,
      status: "unavailable",
      error: "not configured",
      canRetry: false,
    };
    rerender(<LpDesk />);
    expect(screen.getByRole("alert").textContent).toContain("not configured");
  });
});
