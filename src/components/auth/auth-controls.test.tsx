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

type LoginCallbacks = {
  onError?: (error: unknown) => void;
};

const sdk = vi.hoisted(() => ({
  login: vi.fn(),
  loginCallbacks: null as LoginCallbacks | null,
  logout: vi.fn<() => Promise<void>>(),
  privy: {
    ready: false,
    authenticated: false,
    user: null as unknown,
  },
  wallets: {
    ready: false,
  },
  balance: {
    balance: 100_000_000n as bigint | null,
    decimals: 6 as number | null,
  },
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogin: (callbacks: LoginCallbacks) => {
    sdk.loginCallbacks = callbacks;
    return { login: sdk.login };
  },
  usePrivy: () => ({ ...sdk.privy, logout: sdk.logout }),
  useWallets: () => sdk.wallets,
}));

vi.mock("@/hooks/use-desk-dollars-balance", () => ({
  useDeskDollarsBalance: () => sdk.balance,
}));

vi.mock("@/hooks/use-desk-dollars-transfer", () => ({
  useDeskDollarsTransfer: () => ({
    status: "idle",
    error: null,
    lastHash: null,
    canTransfer: true,
    canRetry: false,
    transfer: vi.fn(),
    retry: vi.fn(),
  }),
}));

import { AuthControls } from "@/components/auth/auth-controls";

function embeddedUser() {
  return {
    wallet: {
      address: "0x1234",
      chainType: "ethereum",
      walletClientType: "privy",
    },
    linkedAccounts: [],
    phone: "+15555550123",
    email: "private@example.com",
  };
}

function renderSignedInControls() {
  sdk.privy = { ready: true, authenticated: true, user: embeddedUser() };
  sdk.wallets = { ready: true };
  render(<AuthControls />);
}

describe("AuthControls", () => {
  beforeEach(() => {
    sdk.privy = { ready: false, authenticated: false, user: null };
    sdk.wallets = { ready: false };
    sdk.login.mockReset();
    sdk.loginCallbacks = null;
    sdk.logout.mockReset();
    sdk.balance = {
      balance: 100_000_000n,
      decimals: 6,
    };
  });

  afterEach(() => cleanup());

  it("waits for session restoration without an authentication action", () => {
    render(<AuthControls />);

    expect(screen.getByText("Restoring your session…")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue with phone" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });

  it("keeps an external-only wallet in setup, never displays it, and lets the user leave", () => {
    sdk.privy = {
      ready: true,
      authenticated: true,
      user: {
        wallet: {
          address: "0xexternal",
          chainType: "ethereum",
          walletClientType: "metamask",
        },
        linkedAccounts: [],
      },
    };
    sdk.wallets = { ready: true };

    render(<AuthControls />);

    expect(screen.getByText("Setting up your wallet…")).not.toBeNull();
    expect(screen.queryByText(/0xexternal/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(sdk.logout).toHaveBeenCalledTimes(1);
  });

  it("returns a cancelled login to a retryable phone sign-in action", () => {
    sdk.privy = { ready: true, authenticated: false, user: null };
    render(<AuthControls />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with phone" })
    );
    expect(sdk.login).toHaveBeenCalledTimes(1);

    act(() => sdk.loginCallbacks?.onError?.(new Error("cancelled")));
    expect(
      screen.getByText("Sign-in was cancelled or unavailable. Try again.")
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with phone" })
    );
    expect(sdk.login).toHaveBeenCalledTimes(2);
  });

  it("shows truncated wallet and tUSD balance when signed in", () => {
    renderSignedInControls();
    expect(screen.getByText("0x1234")).not.toBeNull();
    expect(screen.getByText("100 tUSD")).not.toBeNull();
    expect(screen.queryByText("+15555550123")).toBeNull();
  });

  it("opens the wallet dialog from the header chip", () => {
    renderSignedInControls();
    expect(screen.queryByTestId("wallet-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("wallet-chip"));

    expect(screen.getByTestId("wallet-dialog")).not.toBeNull();
    expect(screen.getByTestId("wallet-dialog-address").textContent).toBe(
      "0x1234"
    );
    expect(screen.getByRole("heading", { name: "Wallet" })).not.toBeNull();
  });

  it("shows logout pending and ignores rapid duplicate submissions", () => {
    let resolveLogout: () => void;
    sdk.logout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        })
    );
    renderSignedInControls();

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    act(() => {
      fireEvent.click(logoutButton);
      fireEvent.click(logoutButton);
    });

    expect(sdk.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Signing out…")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();

    act(() => resolveLogout());
  });

  it("keeps the session retryable after logout fails", async () => {
    sdk.logout
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce();
    renderSignedInControls();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await screen.findByText("We couldn't sign you out. Please try again.");
    expect(screen.getByText("0x1234")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(sdk.logout).toHaveBeenCalledTimes(2));
  });
});
