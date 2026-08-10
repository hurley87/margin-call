// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  privy: {
    ready: true,
    authenticated: true,
    user: {
      wallet: {
        address: "0xembedded",
        chainType: "ethereum",
        walletClientType: "privy",
      },
      linkedAccounts: [],
    },
  },
  wallets: {
    ready: true,
    wallets: [] as Array<{
      address: string;
      walletClientType: string;
    }>,
  },
  sendTransaction: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => sdk.privy,
  useWallets: () => sdk.wallets,
  useSendTransaction: () => ({ sendTransaction: sdk.sendTransaction }),
}));

import { usePrivySponsoredTransaction } from "@/hooks/use-privy-sponsored-transaction";

const request = {
  to: "0xrecipient",
  data: "0x1234",
  chainId: 84532,
};

describe("usePrivySponsoredTransaction", () => {
  beforeEach(() => {
    sdk.privy = {
      ready: true,
      authenticated: true,
      user: {
        wallet: {
          address: "0xembedded",
          chainType: "ethereum",
          walletClientType: "privy",
        },
        linkedAccounts: [],
      },
    };
    sdk.wallets = {
      ready: true,
      wallets: [
        {
          address: "0xexternal",
          walletClientType: "metamask",
        },
      ],
    };
    sdk.sendTransaction.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sponsors a transaction from the authenticated embedded wallet", async () => {
    sdk.sendTransaction.mockResolvedValue({ hash: "0xsubmitted" });
    const { result } = renderHook(() => usePrivySponsoredTransaction());

    await act(async () => {
      await result.current.submit(request);
    });

    expect(sdk.sendTransaction).toHaveBeenCalledWith(request, {
      sponsor: true,
      address: "0xembedded",
    });
  });

  it("records Privy's returned hash as submitted without claiming confirmation", async () => {
    sdk.sendTransaction.mockResolvedValue({ hash: "0xsubmitted" });
    const { result } = renderHook(() => usePrivySponsoredTransaction());

    await act(async () => {
      await result.current.submit(request);
    });

    expect(result.current.status).toBe("submitted");
    expect(result.current.hash).toBe("0xsubmitted");
    expect(result.current.error).toBeNull();
  });

  it("retries the identical failed request with sponsorship and a safe error", async () => {
    sdk.sendTransaction
      .mockRejectedValueOnce(new Error("authorization: secret session value"))
      .mockResolvedValueOnce({ hash: "0xretried" });
    const { result } = renderHook(() => usePrivySponsoredTransaction());

    await act(async () => {
      await result.current.submit(request);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "We couldn't submit that transaction. Please try again."
    );
    expect(result.current.canRetry).toBe(true);

    await act(async () => {
      await result.current.retry();
    });

    expect(sdk.sendTransaction).toHaveBeenNthCalledWith(1, request, {
      sponsor: true,
      address: "0xembedded",
    });
    expect(sdk.sendTransaction).toHaveBeenNthCalledWith(2, request, {
      sponsor: true,
      address: "0xembedded",
    });
    expect(result.current).toMatchObject({
      status: "submitted",
      hash: "0xretried",
      error: null,
      canRetry: false,
    });
  });

  it("blocks a duplicate submission while the first one is in flight", async () => {
    let resolveSend: (value: { hash: `0x${string}` }) => void;
    sdk.sendTransaction.mockImplementation(
      () =>
        new Promise<{ hash: `0x${string}` }>((resolve) => {
          resolveSend = resolve;
        })
    );
    const { result } = renderHook(() => usePrivySponsoredTransaction());

    let firstSubmission: Promise<boolean>;
    let duplicateSubmission: Promise<boolean>;
    act(() => {
      firstSubmission = result.current.submit(request);
      duplicateSubmission = result.current.submit(request);
    });

    expect(sdk.sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      status: "submitting",
      canSubmit: false,
    });
    await expect(duplicateSubmission!).resolves.toBe(false);

    await act(async () => {
      resolveSend!({ hash: "0xsubmitted" });
      await firstSubmission!;
    });

    expect(result.current.status).toBe("submitted");
  });

  it.each([
    {
      name: "Privy is restoring the session",
      configure: () => {
        sdk.privy.ready = false;
      },
    },
    {
      name: "the wallet list is still loading",
      configure: () => {
        sdk.wallets.ready = false;
      },
    },
    {
      name: "only an external wallet is present",
      configure: () => {
        sdk.privy.user = {
          wallet: {
            address: "0xexternal",
            chainType: "ethereum",
            walletClientType: "metamask",
          },
          linkedAccounts: [],
        };
      },
    },
  ])("refuses submission when $name", async ({ configure }) => {
    configure();
    const { result } = renderHook(() => usePrivySponsoredTransaction());

    await act(async () => {
      await result.current.submit(request);
    });

    expect(sdk.sendTransaction).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      ready: false,
      canSubmit: false,
      canRetry: false,
      status: "error",
      error: "Your wallet is not ready. Please try again.",
    });
  });
});
