// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useInitStatusMock,
  useGetWalletAccountsMock,
  useGetAvailableWalletProvidersDataMock,
  useConnectAndVerifyWithWalletProviderMock,
  useLogoutMock,
  useWalletSessionMock,
  connectMutateMock,
  logoutMutateMock,
  connectResetMock,
  logoutResetMock,
} = vi.hoisted(() => ({
  useInitStatusMock: vi.fn(),
  useGetWalletAccountsMock: vi.fn(),
  useGetAvailableWalletProvidersDataMock: vi.fn(),
  useConnectAndVerifyWithWalletProviderMock: vi.fn(),
  useLogoutMock: vi.fn(),
  useWalletSessionMock: vi.fn(),
  connectMutateMock: vi.fn(),
  logoutMutateMock: vi.fn(),
  connectResetMock: vi.fn(),
  logoutResetMock: vi.fn(),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useInitStatus: useInitStatusMock,
  useGetWalletAccounts: useGetWalletAccountsMock,
  useGetAvailableWalletProvidersData: useGetAvailableWalletProvidersDataMock,
  useConnectAndVerifyWithWalletProvider:
    useConnectAndVerifyWithWalletProviderMock,
  useLogout: useLogoutMock,
}));

vi.mock("@/components/wallet/wallet-providers", () => ({
  useDynamicReady: () => true,
  useWalletSession: useWalletSessionMock,
}));

import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";

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
      data: [
        {
          key: "metamaskevm",
          chain: "EVM",
          groupKey: "metamask",
          walletProviderType: "browserExtension",
          metadata: { displayName: "MetaMask", icon: "" },
        },
      ],
    });
    useConnectAndVerifyWithWalletProviderMock.mockReturnValue({
      mutate: connectMutateMock,
      isPending: false,
      error: null,
      reset: connectResetMock,
    });
    useLogoutMock.mockReturnValue({
      mutate: logoutMutateMock,
      isPending: false,
      error: null,
      reset: logoutResetMock,
    });
  });

  afterEach(() => {
    cleanup();
    connectMutateMock.mockReset();
    logoutMutateMock.mockReset();
    connectResetMock.mockReset();
    logoutResetMock.mockReset();
    useWalletSessionMock.mockReset();
  });

  it("shows Connect when disconnected", () => {
    render(<WalletConnectUi />);

    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("shows a truncated address and Disconnect when connected", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    render(<WalletConnectUi />);

    expect(screen.getByText("0x1234…5678")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
  });

  it("clears connected state through logout", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

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
