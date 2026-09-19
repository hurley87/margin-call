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
  verifyMutateMock,
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
  verifyMutateMock: vi.fn(),
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

import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";

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
  address: "0x1234567890abcdef1234567890abcdef12345678",
  lastSelectedAt: null,
  verifiedCredentialId: null,
  walletProviderKey: "metamaskevm",
};

const verifiedAccount = {
  ...unverifiedAccount,
  verifiedCredentialId: "vc-1",
};

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
      mutate: verifyMutateMock,
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
    verifyMutateMock.mockReset();
    logoutMutateMock.mockReset();
    connectResetMock.mockReset();
    verifyResetMock.mockReset();
    logoutResetMock.mockReset();
    useWalletSessionMock.mockReset();
  });

  it("shows Connect when disconnected", () => {
    render(<WalletConnectUi />);

    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("connects then verifies so SIWE is not stacked on the pairing prompt", async () => {
    render(<WalletConnectUi />);
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

    render(<WalletConnectUi />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Phantom" }));

    await waitFor(() => {
      expect(connectAsyncMock).toHaveBeenCalledWith({
        walletProviderKey: "phantomevm",
      });
    });
    expect(verifyAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a truncated address and Disconnect when connected", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    useGetWalletAccountsMock.mockReturnValue({ data: [verifiedAccount] });

    render(<WalletConnectUi />);

    expect(screen.getByText("0x1234…5678")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("offers Sign in when the connected wallet still needs a signature", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    useGetWalletAccountsMock.mockReturnValue({ data: [unverifiedAccount] });

    render(<WalletConnectUi />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(verifyMutateMock).toHaveBeenCalledWith({
      walletAccount: unverifiedAccount,
    });
  });

  it("clears connected state through logout", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    useGetWalletAccountsMock.mockReturnValue({ data: [verifiedAccount] });

    render(<WalletConnectUi />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(logoutResetMock).toHaveBeenCalled();
    expect(logoutMutateMock).toHaveBeenCalled();
  });

  it("surfaces an init failure instead of hanging on Preparing wallet", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "failed",
      message: "Project settings unavailable",
    });

    render(<WalletConnectUi />);

    expect(screen.getByText("Project settings unavailable")).not.toBeNull();
    expect(screen.queryByText("Preparing wallet…")).toBeNull();
  });
});
