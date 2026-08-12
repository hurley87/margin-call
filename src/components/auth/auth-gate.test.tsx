// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  privy: {
    ready: false,
    authenticated: false,
    user: null as unknown,
  },
  wallets: {
    ready: false,
  },
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => sdk.privy,
  useWallets: () => sdk.wallets,
}));

import { AuthGate } from "@/components/auth/auth-gate";

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

describe("AuthGate", () => {
  beforeEach(() => {
    sdk.privy = { ready: false, authenticated: false, user: null };
    sdk.wallets = { ready: false };
  });

  afterEach(() => cleanup());

  it("renders gated children only once the user is signed in", () => {
    sdk.privy = { ready: true, authenticated: false, user: null };
    sdk.wallets = { ready: false };
    const { rerender } = render(
      <AuthGate>
        <p>Gated content</p>
      </AuthGate>
    );

    expect(screen.queryByText("Gated content")).toBeNull();

    sdk.privy = { ready: true, authenticated: true, user: embeddedUser() };
    sdk.wallets = { ready: true };
    rerender(
      <AuthGate>
        <p>Gated content</p>
      </AuthGate>
    );

    expect(screen.getByText("Gated content")).not.toBeNull();
  });
});
