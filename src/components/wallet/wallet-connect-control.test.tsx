// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useInitStatusMock,
  useGetWalletAccountsMock,
  useGetAvailableWalletProvidersDataMock,
  useConnectAndVerifyWithWalletProviderMock,
  useLogoutMock,
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

import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";

describe("WalletConnectControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("shows configure copy when Dynamic is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "");

    render(<WalletConnectControl />);

    expect(
      screen.getByText("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID")
    ).not.toBeNull();
    expect(screen.getByText(/to enable Connect/)).not.toBeNull();
  });
});
describe("WalletConnectUi", () => {
  beforeEach(() => {
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
  });

  it("shows Connect when disconnected", () => {
    render(<WalletConnectUi />);

    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("shows a truncated address and Disconnect when connected", () => {
    useGetWalletAccountsMock.mockReturnValue({
      data: [
        {
          id: "account-1",
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          lastSelectedAt: null,
          verifiedCredentialId: null,
          walletProviderKey: "metamaskevm",
        },
      ],
    });

    render(<WalletConnectUi />);

    expect(screen.getByText("0x1234…5678")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
  });

  it("clears connected state through logout", () => {
    useGetWalletAccountsMock.mockReturnValue({
      data: [
        {
          id: "account-1",
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          lastSelectedAt: null,
          verifiedCredentialId: null,
          walletProviderKey: "metamaskevm",
        },
      ],
    });

    render(<WalletConnectUi />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(logoutResetMock).toHaveBeenCalled();
    expect(logoutMutateMock).toHaveBeenCalled();
  });

  it("surfaces an init failure instead of hanging on Preparing wallet", () => {
    useInitStatusMock.mockReturnValue({
      data: "failed",
      error: new Error("Project settings unavailable"),
    });

    render(<WalletConnectUi />);

    expect(screen.getByText("Project settings unavailable")).not.toBeNull();
    expect(screen.queryByText("Preparing wallet…")).toBeNull();
  });
});
