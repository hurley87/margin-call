import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { WalletAccountAlreadyVerifiedError } from "@dynamic-labs-sdk/client";
import { describe, expect, it, vi } from "vitest";
import {
  connectThenVerifyWallet,
  shouldAutoVerifyAfterConnect,
} from "@/lib/dynamic/connect-then-verify";

function account(verifiedCredentialId: string | null = null): WalletAccount {
  return {
    id: "account-1",
    chain: "EVM",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    lastSelectedAt: null,
    verifiedCredentialId,
    walletProviderKey: "metamaskevm",
  } as WalletAccount;
}

describe("shouldAutoVerifyAfterConnect", () => {
  it("auto-verifies installed and WalletConnect providers", () => {
    expect(shouldAutoVerifyAfterConnect({ isDeeplinkProvider: false })).toBe(
      true
    );
  });

  it("skips auto-verify for deep-link wallets", () => {
    expect(shouldAutoVerifyAfterConnect({ isDeeplinkProvider: true })).toBe(
      false
    );
  });
});

describe("connectThenVerifyWallet", () => {
  it("connects then verifies after the connect prompt can close", async () => {
    const connected = account();
    const verified = account("vc-1");
    const connect = vi.fn().mockResolvedValue(connected);
    const verify = vi.fn().mockResolvedValue(verified);
    const waitForPrompt = vi.fn().mockResolvedValue(undefined);

    await expect(
      connectThenVerifyWallet({
        walletProviderKey: "metamaskevm",
        isDeeplinkProvider: false,
        connect,
        verify,
        isVerified: (walletAccount) =>
          walletAccount.verifiedCredentialId != null,
        waitForPrompt,
      })
    ).resolves.toEqual(verified);

    expect(connect).toHaveBeenCalledWith({
      walletProviderKey: "metamaskevm",
    });
    expect(waitForPrompt).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith({ walletAccount: connected });
    expect(waitForPrompt.mock.invocationCallOrder[0]).toBeLessThan(
      verify.mock.invocationCallOrder[0]!
    );
  });

  it("does not request a signature when connect already verified", async () => {
    const verified = account("vc-1");
    const connect = vi.fn().mockResolvedValue(verified);
    const verify = vi.fn();

    await expect(
      connectThenVerifyWallet({
        walletProviderKey: "metamaskevm",
        isDeeplinkProvider: false,
        connect,
        verify,
        isVerified: () => true,
        waitForPrompt: vi.fn(),
      })
    ).resolves.toEqual(verified);

    expect(verify).not.toHaveBeenCalled();
  });

  it("leaves deep-link wallets unverified for a later Sign in tap", async () => {
    const connected = account();
    const connect = vi.fn().mockResolvedValue(connected);
    const verify = vi.fn();

    await expect(
      connectThenVerifyWallet({
        walletProviderKey: "phantomevm",
        isDeeplinkProvider: true,
        connect,
        verify,
        isVerified: () => false,
        waitForPrompt: vi.fn(),
      })
    ).resolves.toEqual(connected);

    expect(verify).not.toHaveBeenCalled();
  });

  it("treats an already-verified wallet as success", async () => {
    const connected = account();
    const connect = vi.fn().mockResolvedValue(connected);
    const verify = vi
      .fn()
      .mockRejectedValue(
        new WalletAccountAlreadyVerifiedError(connected.address)
      );

    await expect(
      connectThenVerifyWallet({
        walletProviderKey: "metamaskevm",
        isDeeplinkProvider: false,
        connect,
        verify,
        isVerified: () => false,
        waitForPrompt: async () => undefined,
      })
    ).resolves.toEqual(connected);
  });
});
