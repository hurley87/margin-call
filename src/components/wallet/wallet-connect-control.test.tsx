// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useInitStatusMock,
  useGetWalletAccountsMock,
  useGetAvailableWalletProvidersDataMock,
  useConnectWithWalletProviderMock,
  useVerifyWalletAccountMock,
  useLogoutMock,
  useWalletSessionMock,
  connectAsyncMock,
  verifyAsyncMock,
  logoutMutateMock,
  connectResetMock,
  verifyResetMock,
  logoutResetMock,
} = vi.hoisted(() => ({
  useInitStatusMock: vi.fn(),
  useGetWalletAccountsMock: vi.fn(),
  useGetAvailableWalletProvidersDataMock: vi.fn(),
  useConnectWithWalletProviderMock: vi.fn(),
  useVerifyWalletAccountMock: vi.fn(),
  useLogoutMock: vi.fn(),
  useWalletSessionMock: vi.fn(),
  connectAsyncMock: vi.fn(),
  verifyAsyncMock: vi.fn(),
  logoutMutateMock: vi.fn(),
  connectResetMock: vi.fn(),
  verifyResetMock: vi.fn(),
  logoutResetMock: vi.fn(),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useInitStatus: useInitStatusMock,
  useGetWalletAccounts: useGetWalletAccountsMock,
  useGetAvailableWalletProvidersData: useGetAvailableWalletProvidersDataMock,
  useConnectWithWalletProvider: useConnectWithWalletProviderMock,
  useVerifyWalletAccount: useVerifyWalletAccountMock,
  useLogout: useLogoutMock,
}));

vi.mock("@/components/wallet/wallet-providers", () => ({
  useDynamicReady: () => true,
  useWalletSession: useWalletSessionMock,
}));

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";

const CONNECTED_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

const metamaskProvider = {
  key: "metamaskevm",
  chain: "EVM",
  groupKey: "metamask",
  walletProviderType: "browserExtension",
  metadata: { displayName: "MetaMask", icon: "" },
};

const phantomDeeplinkProvider = {
  key: "phantomevm",
  chain: "EVM",
  groupKey: "phantom",
  walletProviderType: "deepLink",
  metadata: { displayName: "Phantom", icon: "" },
};

const unverifiedAccount = {
  id: "account-1",
  chain: "EVM",
  address: CONNECTED_ADDRESS,
  lastSelectedAt: null,
  verifiedCredentialId: null,
  walletProviderKey: "metamaskevm",
} as WalletAccount;

const verifiedAccount = {
  ...unverifiedAccount,
  verifiedCredentialId: "vc-1",
} as WalletAccount;

describe("WalletConnectControl", () => {
  afterEach(() => {
    cleanup();
    useWalletSessionMock.mockReset();
  });

  it("shows configure copy when wallet session is unset", () => {
    useWalletSessionMock.mockReturnValue({ kind: "unset" });

    render(<WalletConnectControl />);

    expect(
      screen.getByText("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID")
    ).not.toBeNull();
    expect(screen.getByText(/to enable Connect/)).not.toBeNull();
  });
});

describe("WalletConnectUi", () => {
  beforeEach(() => {
    useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
    useInitStatusMock.mockReturnValue({ data: "finished", error: null });
    useGetWalletAccountsMock.mockReturnValue({ data: [] });
    useGetAvailableWalletProvidersDataMock.mockReturnValue({
      data: [metamaskProvider],
    });
    useConnectWithWalletProviderMock.mockReturnValue({
      mutateAsync: connectAsyncMock,
      isPending: false,
      error: null,
      reset: connectResetMock,
    });
    useVerifyWalletAccountMock.mockReturnValue({
      mutateAsync: verifyAsyncMock,
      isPending: false,
      error: null,
      reset: verifyResetMock,
    });
    useLogoutMock.mockReturnValue({
      mutate: logoutMutateMock,
      isPending: false,
      error: null,
      reset: logoutResetMock,
    });
    connectAsyncMock.mockResolvedValue(unverifiedAccount);
    verifyAsyncMock.mockResolvedValue(verifiedAccount);
  });

  afterEach(() => {
    cleanup();
    connectAsyncMock.mockReset();
    verifyAsyncMock.mockReset();
    logoutMutateMock.mockReset();
    connectResetMock.mockReset();
    verifyResetMock.mockReset();
    logoutResetMock.mockReset();
    useWalletSessionMock.mockReset();
  });

  it("shows Connect when disconnected", () => {
    render(<WalletConnectUi evmAccount={null} />);

    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("connects then verifies so SIWE is not stacked on the pairing prompt", async () => {
    render(<WalletConnectUi evmAccount={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "MetaMask" }));

    await waitFor(() => {
      expect(connectAsyncMock).toHaveBeenCalledWith({
        walletProviderKey: "metamaskevm",
      });
    });
    await waitFor(() => {
      expect(verifyAsyncMock).toHaveBeenCalledWith({
        walletAccount: unverifiedAccount,
      });
    });
    expect(connectAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
      verifyAsyncMock.mock.invocationCallOrder[0]!
    );
  });

  it("does not auto-verify a deep-link wallet", async () => {
    useGetAvailableWalletProvidersDataMock.mockReturnValue({
      data: [phantomDeeplinkProvider],
    });

    render(<WalletConnectUi evmAccount={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Phantom" }));

    await waitFor(() => {
      expect(connectAsyncMock).toHaveBeenCalledWith({
        walletProviderKey: "phantomevm",
      });
    });
    expect(verifyAsyncMock).not.toHaveBeenCalled();
  });

  it("keeps the picker up through the connect to SIWE gap", () => {
    connectAsyncMock.mockImplementation(() => new Promise(() => {}));

    const { rerender } = render(<WalletConnectUi evmAccount={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "MetaMask" }));

    // Pairing landed, so the session reports connected while SIWE is still pending.
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });
    rerender(<WalletConnectUi evmAccount={unverifiedAccount} />);

    expect(screen.getByRole("button", { name: "MetaMask" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("shows a truncated address and Disconnect when connected", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });

    render(<WalletConnectUi evmAccount={verifiedAccount} />);

    expect(screen.getByText("0x1234…5678")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("offers Sign in when the connected wallet still needs a signature", async () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });

    render(<WalletConnectUi evmAccount={unverifiedAccount} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(verifyAsyncMock).toHaveBeenCalledWith({
        walletAccount: unverifiedAccount,
      });
    });
  });

  it("clears connected state through logout", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });

    render(<WalletConnectUi evmAccount={verifiedAccount} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(logoutResetMock).toHaveBeenCalled();
    expect(logoutMutateMock).toHaveBeenCalled();
  });

  it("surfaces an init failure instead of hanging on Preparing wallet", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "failed",
      message: "Project settings unavailable",
    });

    render(<WalletConnectUi evmAccount={null} />);

    expect(screen.getByText("Project settings unavailable")).not.toBeNull();
    expect(screen.queryByText("Preparing wallet…")).toBeNull();
  });
});
