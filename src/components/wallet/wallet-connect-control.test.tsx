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
} = vi.hoisted(() => ({
  useInitStatusMock: vi.fn(),
  useGetWalletAccountsMock: vi.fn(),
  useGetAvailableWalletProvidersDataMock: vi.fn(),
  useConnectAndVerifyWithWalletProviderMock: vi.fn(),
  useLogoutMock: vi.fn(),
  connectMutateMock: vi.fn(),
  logoutMutateMock: vi.fn(),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useInitStatus: useInitStatusMock,
  useGetWalletAccounts: useGetWalletAccountsMock,
  useGetAvailableWalletProvidersData: useGetAvailableWalletProvidersDataMock,
  useConnectAndVerifyWithWalletProvider:
    useConnectAndVerifyWithWalletProviderMock,
  useLogout: useLogoutMock,
}));

import { ConfiguredWalletConnectControl } from "@/components/wallet/configured-wallet-connect-control";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";

describe("WalletConnectControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("hides the control when Dynamic is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "");

    const { container } = render(<WalletConnectControl />);

    expect(container.firstChild).toBeNull();
  });
});

describe("ConfiguredWalletConnectControl", () => {
  beforeEach(() => {
    useInitStatusMock.mockReturnValue({ data: "finished" });
    useGetWalletAccountsMock.mockReturnValue({ data: [] });
    useGetAvailableWalletProvidersDataMock.mockReturnValue({
      data: [
        {
          key: "metamaskevm",
          chain: "EVM",
          metadata: { displayName: "MetaMask", icon: "" },
        },
      ],
    });
    useConnectAndVerifyWithWalletProviderMock.mockReturnValue({
      mutate: connectMutateMock,
      isPending: false,
    });
    useLogoutMock.mockReturnValue({
      mutate: logoutMutateMock,
      isPending: false,
    });
  });

  afterEach(() => {
    cleanup();
    connectMutateMock.mockReset();
    logoutMutateMock.mockReset();
  });

  it("shows Connect when disconnected", () => {
    render(<ConfiguredWalletConnectControl />);

    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("shows a truncated address and Disconnect when connected", () => {
    useGetWalletAccountsMock.mockReturnValue({
      data: [
        {
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        },
      ],
    });

    render(<ConfiguredWalletConnectControl />);

    expect(screen.getByText("0x1234…5678")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
  });

  it("clears connected state through logout", () => {
    useGetWalletAccountsMock.mockReturnValue({
      data: [
        {
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        },
      ],
    });

    render(<ConfiguredWalletConnectControl />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(logoutMutateMock).toHaveBeenCalled();
  });
});
