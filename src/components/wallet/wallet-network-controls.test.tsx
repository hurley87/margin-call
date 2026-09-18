// @vitest-environment jsdom

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useGetActiveNetworkIdMock,
  isProgrammaticNetworkSwitchAvailableMock,
  switchWalletToBaseMock,
} = vi.hoisted(() => ({
  useGetActiveNetworkIdMock: vi.fn(),
  isProgrammaticNetworkSwitchAvailableMock: vi.fn(),
  switchWalletToBaseMock: vi.fn(),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useGetActiveNetworkId: useGetActiveNetworkIdMock,
}));

vi.mock("@dynamic-labs-sdk/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@dynamic-labs-sdk/client")>();
  return {
    ...actual,
    isProgrammaticNetworkSwitchAvailable:
      isProgrammaticNetworkSwitchAvailableMock,
  };
});

vi.mock("@/lib/dynamic/resolve-wallet-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/dynamic/resolve-wallet-client")
    >();
  return {
    ...actual,
    switchWalletToBase: switchWalletToBaseMock,
  };
});

import { WalletNetworkControls } from "@/components/wallet/wallet-network-controls";

function account(): WalletAccount {
  return {
    id: "account-1",
    chain: "EVM",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    lastSelectedAt: null,
    verifiedCredentialId: null,
    walletProviderKey: "metamaskevm",
  } as WalletAccount;
}

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("WalletNetworkControls", () => {
  beforeEach(() => {
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "1" },
    });
    isProgrammaticNetworkSwitchAvailableMock.mockReturnValue(true);
    switchWalletToBaseMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    useGetActiveNetworkIdMock.mockReset();
    isProgrammaticNetworkSwitchAvailableMock.mockReset();
    switchWalletToBaseMock.mockReset();
  });

  it("calls switchWalletToBase when Switch to Base is clicked", async () => {
    const walletAccount = account();
    renderWithQuery(<WalletNetworkControls evmAccount={walletAccount} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Base" }));

    await waitFor(() => {
      expect(switchWalletToBaseMock).toHaveBeenCalledWith(walletAccount);
    });
  });

  it("shows a manual prompt when programmatic switch is unavailable", () => {
    isProgrammaticNetworkSwitchAvailableMock.mockReturnValue(false);

    renderWithQuery(<WalletNetworkControls evmAccount={account()} />);

    expect(
      screen.getByText("Switch the wallet to Base mainnet (8453) to continue.")
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Switch to Base" })).toBeNull();
  });

  it("surfaces a mutation error message", async () => {
    switchWalletToBaseMock.mockRejectedValue(new Error("user rejected"));

    renderWithQuery(<WalletNetworkControls evmAccount={account()} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Base" }));

    expect(await screen.findByText("user rejected")).not.toBeNull();
  });
});
