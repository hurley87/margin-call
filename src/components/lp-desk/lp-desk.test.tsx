// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankrollVaultDepositStatus,
  BankrollVaultRetryAction,
  BankrollVaultWithdrawalRecovery,
} from "@/hooks/use-bankroll-vault-deposit";

type VaultFixture = {
  status: BankrollVaultDepositStatus;
  error: string | null;
  canDeposit: boolean;
  canWithdraw: boolean;
  canRetry: boolean;
  withdrawalRecovery: BankrollVaultWithdrawalRecovery | null;
  retryAction: BankrollVaultRetryAction | null;
  tUsdBalance: bigint | undefined;
  shareBalance: bigint;
  assetsPerShare: bigint;
  grossAssets: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
  pendingObligations: bigint;
  unrecognizedMargin: bigint;
  reservedLiabilities: bigint;
  safetyBuffer: bigint;
  freeLiquidity: bigint;
  maxWithdraw: bigint;
  realizedGamePnl: bigint;
  shareOperationsFrozen: boolean;
  blockingRounds: Array<{
    roundId: bigint;
    expiresAt: bigint;
    revealFrozen: boolean;
    expiryEligible: boolean;
  }>;
  earliestExpiry: bigint | undefined;
  chainTimestamp: bigint | undefined;
  utilizationBps: bigint;
  tierCapacity: Array<{
    leverageBps: bigint;
    label: string;
    maxMargin: bigint;
  }>;
  deposit: ReturnType<typeof vi.fn>;
  withdraw: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
};

const sdk = vi.hoisted(() => {
  const ready = (): VaultFixture => ({
    status: "ready",
    error: null,
    canDeposit: true,
    canWithdraw: true,
    canRetry: false,
    withdrawalRecovery: null,
    retryAction: null,
    tUsdBalance: 123450000n,
    shareBalance: 50000000n,
    assetsPerShare: 1000000n,
    grossAssets: 25000000000n,
    totalAssets: 25000000000n,
    totalSupply: 25000000000n,
    pendingObligations: 0n,
    unrecognizedMargin: 0n,
    reservedLiabilities: 1250000000n,
    safetyBuffer: 5000000000n,
    freeLiquidity: 18750000000n,
    maxWithdraw: 37500000n,
    realizedGamePnl: -250000n,
    shareOperationsFrozen: false,
    blockingRounds: [],
    earliestExpiry: undefined,
    chainTimestamp: 1_000_000n,
    utilizationBps: 500n,
    tierCapacity: [
      { leverageBps: 12_500n, label: "1.25x", maxMargin: 80_000_000n },
      { leverageBps: 15_000n, label: "1.50x", maxMargin: 66_666_666n },
      { leverageBps: 20_000n, label: "2.00x", maxMargin: 50_000_000n },
      { leverageBps: 30_000n, label: "3.00x", maxMargin: 33_333_333n },
      { leverageBps: 50_000n, label: "5.00x", maxMargin: 20_000_000n },
      { leverageBps: 100_000n, label: "10.00x", maxMargin: 10_000_000n },
    ],
    deposit: vi.fn(),
    withdraw: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
  });
  return {
    vault: ready(),
    ready,
    freeze: {
      status: "idle" as const,
      error: null as string | null,
      activeRoundId: null as bigint | null,
      canAct: true,
      canRetry: false,
      retryAction: null as null,
      finalizeRound: vi.fn(),
      expireRound: vi.fn(),
      resolveBlockingRound: vi.fn(),
      retry: vi.fn(),
    },
  };
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
vi.mock("@/hooks/use-lp-freeze-actions", () => ({
  useLpFreezeActions: () => sdk.freeze,
}));

import { LpDesk } from "./lp-desk";

beforeEach(() => {
  sdk.vault = sdk.ready();
  sdk.freeze.resolveBlockingRound.mockReset();
  sdk.freeze.retry.mockReset();
  sdk.freeze.status = "idle";
  sdk.freeze.error = null;
  sdk.freeze.canAct = true;
  sdk.freeze.canRetry = false;
  sdk.freeze.retryAction = null;
  sdk.freeze.activeRoundId = null;
});
afterEach(() => cleanup());

describe("LpDesk", () => {
  it("shows the authenticated wallet and complete vault risk display", () => {
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
      screen.getByText("Realized vault gain/loss").nextElementSibling
        ?.textContent
    ).toBe("−0.25 tUSD");
    expect(
      screen.getByText("Gross assets").nextElementSibling?.textContent
    ).toBe("25000 tUSD");
    expect(
      screen.getByText("Reserved liabilities").nextElementSibling?.textContent
    ).toBe("1250 tUSD");
    expect(
      screen.getByText("Safety buffer").nextElementSibling?.textContent
    ).toBe("5000 tUSD");
    expect(
      screen.getByText("Global free liquidity").nextElementSibling?.textContent
    ).toBe("18750 tUSD");
    expect(
      screen.getByText("Utilization").nextElementSibling?.textContent
    ).toBe("5.00%");
    expect(
      screen.getByText("Your immediately withdrawable tUSD").nextElementSibling
        ?.textContent
    ).toBe("37.5 tUSD");
    expect(screen.getByText("1.25x")).not.toBeNull();
    expect(screen.getByText(/80 tUSD max margin/)).not.toBeNull();
    expect(
      screen.getByText(/Global free liquidity is the vault-wide capacity/)
    ).not.toBeNull();
    expect(
      screen.getByText(/Liquidity providers can lose tUSD when players win/i)
    ).not.toBeNull();
    expect(screen.getByText(/Base Sepolia/)).not.toBeNull();
  });

  it("shows the freeze banner with honest overlapping-outage copy and actions", () => {
    sdk.vault = {
      ...sdk.ready(),
      canDeposit: false,
      canWithdraw: false,
      shareOperationsFrozen: true,
      earliestExpiry: 1_000_900n,
      blockingRounds: [
        {
          roundId: 4n,
          expiresAt: 1_000_900n,
          revealFrozen: true,
          expiryEligible: false,
        },
        {
          roundId: 5n,
          expiresAt: 1_001_000n,
          revealFrozen: false,
          expiryEligible: true,
        },
      ],
    };
    render(<LpDesk />);
    expect(
      screen.getByText(/Reveal-window freeze — LP deposits and withdrawals/)
    ).not.toBeNull();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P"
          ? /bounds one round's freeze, not the total/i.test(
              element.textContent ?? ""
            )
          : false
      )
    ).not.toBeNull();
    expect(screen.getByText(/frozen indefinitely/i)).not.toBeNull();
    expect(screen.getByText("Round 4")).not.toBeNull();
    expect(screen.getByText("Round 5")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finalize round" }));
    expect(sdk.freeze.resolveBlockingRound).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: 4n })
    );
    fireEvent.click(screen.getByRole("button", { name: "Expire round" }));
    expect(sdk.freeze.resolveBlockingRound).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: 5n })
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Deposits frozen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Withdrawals frozen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
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

  it("never claims the balance is still loading in permanent unavailable or error states", () => {
    sdk.vault = {
      ...sdk.ready(),
      status: "unavailable",
      error: "not configured",
      canDeposit: false,
      tUsdBalance: undefined,
    };
    const { rerender } = render(<LpDesk />);
    const input = screen.getByLabelText("LP deposit amount (tUSD)");
    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.queryByText(/still loading/)).toBeNull();
    sdk.vault = {
      ...sdk.vault,
      status: "error",
      error: "load failed",
      canRetry: true,
    };
    rerender(<LpDesk />);
    expect(screen.queryByText(/still loading/)).toBeNull();
    sdk.vault = { ...sdk.vault, status: "loading", error: null };
    rerender(<LpDesk />);
    expect(screen.getByText(/still loading/)).not.toBeNull();
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

  it("parses and submits an exact six-decimal tUSD withdrawal within maxWithdraw", () => {
    render(<LpDesk />);
    const input = screen.getByLabelText("LP withdrawal amount (tUSD)");
    fireEvent.change(input, { target: { value: "12.345678" } });
    fireEvent.submit(input.closest("form")!);
    expect(sdk.vault.withdraw).toHaveBeenCalledWith(12345678n);
  });

  it("validates positive withdrawals and the authoritative maxWithdraw limit", () => {
    render(<LpDesk />);
    const input = screen.getByLabelText("LP withdrawal amount (tUSD)");
    fireEvent.change(input, { target: { value: "0" } });
    expect(screen.getByText("Enter a positive tUSD amount.")).not.toBeNull();
    fireEvent.change(input, { target: { value: "37.500001" } });
    expect(
      screen.getByText(/cannot exceed your immediately withdrawable tUSD limit/)
    ).not.toBeNull();
    fireEvent.change(input, { target: { value: "1.0000001" } });
    expect(screen.getAllByText(/no more than 6 decimal places/)).toHaveLength(
      1
    );
    expect(sdk.vault.withdraw).not.toHaveBeenCalled();
  });

  it("keeps wallet assets and limits authoritative while a withdrawal receipt is pending", () => {
    sdk.vault = {
      ...sdk.vault,
      status: "withdrawal-pending",
      canDeposit: false,
      canWithdraw: false,
    };
    render(<LpDesk />);
    expect(
      screen.getByText(
        /LP withdrawal pending until its Base Sepolia receipt succeeds/
      )
    ).not.toBeNull();
    expect(
      screen.getByText("Wallet Desk Dollars").nextElementSibling?.textContent
    ).toBe("123.45 tUSD");
    expect(
      screen.getByText("Wallet vault shares").nextElementSibling?.textContent
    ).toBe("50 vault shares");
    expect(
      screen.getByText("Your immediately withdrawable tUSD").nextElementSibling
        ?.textContent
    ).toBe("37.5 tUSD");
  });

  it("renders withdrawal lifecycle, corrected-limit recovery, and unambiguous retry actions", () => {
    const { rerender } = render(<LpDesk />);
    sdk.vault = {
      ...sdk.vault,
      status: "withdrawal-submitting",
      canDeposit: false,
      canWithdraw: false,
    };
    rerender(<LpDesk />);
    expect(screen.getByText("Submitting your LP withdrawal…")).not.toBeNull();
    sdk.vault = {
      ...sdk.vault,
      status: "withdrawal-confirmed",
    };
    rerender(<LpDesk />);
    expect(
      screen.getByText("LP withdrawal confirmed on Base Sepolia.")
    ).not.toBeNull();
    sdk.vault = {
      ...sdk.vault,
      status: "error",
      withdrawalRecovery: "confirmation-unknown",
      retryAction: "withdrawal-receipt-check",
      error: "receipt lookup timed out",
      canRetry: true,
    };
    rerender(<LpDesk />);
    expect(screen.getByRole("alert").textContent).toContain(
      "receipt is still unconfirmed"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry withdrawal receipt check" })
    );
    expect(sdk.vault.retry).toHaveBeenCalledOnce();
    sdk.vault = {
      ...sdk.vault,
      withdrawalRecovery: "reverted-or-failed",
      retryAction: "withdrawal",
      error: "reverted",
      canRetry: false,
      canWithdraw: true,
      maxWithdraw: 10000000n,
    };
    rerender(<LpDesk />);
    expect(
      screen.getByText(/authoritative withdrawable limit was refreshed/)
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retry withdrawal" })
    ).toBeNull();
    const input = screen.getByLabelText("LP withdrawal amount (tUSD)");
    fireEvent.change(input, { target: { value: "12" } });
    expect(
      screen.getByText(/cannot exceed your immediately withdrawable tUSD limit/)
    ).not.toBeNull();
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.submit(input.closest("form")!);
    expect(sdk.vault.withdraw).toHaveBeenCalledWith(10000000n);
    sdk.vault = {
      ...sdk.vault,
      withdrawalRecovery: "refresh-after-confirmation",
      retryAction: "refresh-after-withdrawal-confirmation",
      error: "refresh failed",
      canRetry: true,
      canWithdraw: false,
    };
    rerender(<LpDesk />);
    expect(
      screen.getByText(/withdrawal was confirmed, but the refreshed balances/)
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Refresh confirmed withdrawal" })
    ).not.toBeNull();
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
      retryAction: "refresh-after-confirmation",
    };
    rerender(<LpDesk />);
    expect(screen.getByRole("alert").textContent).toContain(
      "confirmed but refresh failed"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh confirmed deposit" })
    );
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

  it("labels a plain state-reload retry neutrally after a failed initial load", () => {
    sdk.vault = {
      ...sdk.ready(),
      status: "error",
      error: "load failed",
      canDeposit: false,
      canWithdraw: false,
      canRetry: true,
      retryAction: "refresh",
    };
    render(<LpDesk />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(sdk.vault.retry).toHaveBeenCalledOnce();
  });

  it("shows a deposit refresh error as itself right after a withdrawal flow", () => {
    sdk.vault = {
      ...sdk.vault,
      status: "error",
      withdrawalRecovery: null,
      retryAction: "refresh-after-confirmation",
      error:
        "Your deposit was confirmed, but we couldn't refresh the Bankroll Vault.",
      canDeposit: false,
      canRetry: true,
    };
    render(<LpDesk />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Your deposit was confirmed"
    );
    expect(
      screen.queryByText("LP withdrawal confirmed on Base Sepolia.")
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Refresh confirmed deposit" })
    ).not.toBeNull();
  });

  it("never renders withdrawal recovery copy outside an error state", () => {
    sdk.vault = {
      ...sdk.vault,
      status: "ready",
      withdrawalRecovery: "refresh-after-confirmation",
      retryAction: null,
      error: null,
      canRetry: false,
    };
    render(<LpDesk />);
    expect(
      screen.queryByText(/withdrawal was confirmed, but the refreshed balances/)
    ).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry|refresh/i })).toBeNull();
  });
});
