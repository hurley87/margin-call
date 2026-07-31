"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  PAYMENT_CHAIN,
  ROBINHOOD_TESTNET_STOCK_TOKENS,
  assetRegistryAbi,
  createRobinhoodPublicClient,
  erc20Abi,
  packCustodyAbi,
  ripEngineAbi,
  stockSymbolForAddress,
  txExplorerUrl,
} from "@margin-call/shared";
import {
  createWalletClient,
  custom,
  formatUnits,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";

import { GameButton } from "@/components/ui/game-button";
import { getContractAddresses } from "@/lib/contracts/addresses";
import {
  buildTopUpPlan,
  exitAndRedeemPack,
  redeemExitedPack,
  redemptionPhaseMessage,
  syncConfirmedTopUp,
  topUpAndSyncPack,
  topUpPhaseMessage,
  type RedemptionPhase,
  type RedemptionTransactionAdapter,
  type TopUpPhase,
  type TopUpPlan,
  type TopUpTokenInput,
  type TopUpTransactionAdapter,
} from "@/lib/maker/pack-lifecycle";
import { parseTokenAmount } from "@/lib/maker/pack-composer";
import { formatWadUsd } from "@/lib/pool/nav-distribution";

type LifecycleAddresses = NonNullable<ReturnType<typeof getContractAddresses>>;

type TokenRead = {
  approved?: boolean;
  balance?: bigint;
  allowance?: bigint;
  quote?: bigint;
  quoteError?: string;
};

export type PackLifecycleReads = {
  isListed?: boolean;
  isResting?: boolean;
  basket?: Array<{ asset: Address; amount: bigint }>;
  currentNav?: bigint;
  minPackNav?: bigint;
  poolMax?: bigint;
  tokens: Record<string, TokenRead>;
  basketError?: string;
  error?: string;
};

type ViewProps = {
  tokenId: bigint;
  values: Record<string, string>;
  reads: PackLifecycleReads;
  plan: TopUpPlan;
  topUpPhase: TopUpPhase;
  redemptionPhase: RedemptionPhase;
  topUpConfirmed: boolean;
  exitConfirmed: boolean;
  isReading: boolean;
  isBusy: boolean;
  configured: boolean;
  onAmountChange: (symbol: string, value: string) => void;
  onRefresh: () => void;
  onTopUp: () => void;
  onRetrySync: () => void;
  onRedeem: () => void;
  onRetryRedeem: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/reject|denied|declined/i.test(error.message)) {
      return `Transaction rejected: ${error.message}`;
    }
    return error.message;
  }
  return fallback;
}

function formatBalance(value: bigint | undefined, decimals: number): string {
  if (value === undefined) return "Unavailable";
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function phaseHash(phase: TopUpPhase | RedemptionPhase): Hash | null {
  switch (phase.kind) {
    case "approval-pending":
    case "top-up-pending":
    case "sync-pending":
    case "exit-pending":
    case "redeem-pending":
      return phase.hash;
    default:
      return null;
  }
}

function topUpInputs(
  values: Record<string, string>,
  reads: PackLifecycleReads
): TopUpTokenInput[] {
  return ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => ({
    ...token,
    value: values[token.symbol] ?? "",
    ...reads.tokens[token.symbol],
  }));
}

async function readLifecycleState(
  publicClient: PublicClient,
  addresses: LifecycleAddresses,
  walletAddress: Address,
  tokenId: bigint,
  values: Record<string, string>
): Promise<PackLifecycleReads> {
  const tokenReads: Record<string, TokenRead> = {};

  try {
    const [isListed, isResting, basket, approvedAssets, band, walletReads] =
      await Promise.all([
        publicClient.readContract({
          address: addresses.packCustody,
          abi: packCustodyAbi,
          functionName: "isListed",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: addresses.ripEngine,
          abi: ripEngineAbi,
          functionName: "isResting",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: addresses.packCustody,
          abi: packCustodyAbi,
          functionName: "basketOf",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: addresses.packCustody,
          abi: packCustodyAbi,
          functionName: "whitelistedAssets",
        }),
        Promise.all([
          publicClient.readContract({
            address: addresses.assetRegistry,
            abi: assetRegistryAbi,
            functionName: "minPackNav",
          }),
          publicClient.readContract({
            address: addresses.assetRegistry,
            abi: assetRegistryAbi,
            functionName: "poolMax",
          }),
        ]),
        Promise.all(
          ROBINHOOD_TESTNET_STOCK_TOKENS.map(async (token) => {
            const [balance, allowance] = await Promise.all([
              publicClient.readContract({
                address: token.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [walletAddress],
              }),
              publicClient.readContract({
                address: token.address,
                abi: erc20Abi,
                functionName: "allowance",
                args: [walletAddress, addresses.packCustody],
              }),
            ]);
            return { token, balance, allowance };
          })
        ),
      ]);

    const approved = new Set(
      approvedAssets.map((address) => address.toLowerCase())
    );
    for (const { token, balance, allowance } of walletReads) {
      tokenReads[token.symbol] = {
        approved: approved.has(token.address.toLowerCase()),
        balance,
        allowance,
      };
    }

    const normalizedBasket = basket.map((entry) => ({
      asset: entry.asset,
      amount: entry.amount,
    }));
    let currentNav: bigint | undefined;
    let basketError: string | undefined;
    try {
      const quotes = await Promise.all(
        normalizedBasket.map((entry) =>
          publicClient.readContract({
            address: addresses.assetRegistry,
            abi: assetRegistryAbi,
            functionName: "quote",
            args: [entry.asset, entry.amount],
          })
        )
      );
      currentNav = quotes.reduce((sum, quote) => sum + quote, 0n);
    } catch {
      basketError = "Existing basket quote unavailable or stale";
    }

    await Promise.all(
      ROBINHOOD_TESTNET_STOCK_TOKENS.map(async (token) => {
        const value = values[token.symbol] ?? "";
        if (!value.trim()) return;
        const parsed = parseTokenAmount(value, token.decimals);
        if (!parsed.ok) return;
        try {
          tokenReads[token.symbol].quote = await publicClient.readContract({
            address: addresses.assetRegistry,
            abi: assetRegistryAbi,
            functionName: "quote",
            args: [token.address, parsed.amount],
          });
        } catch {
          tokenReads[token.symbol].quoteError =
            "live quote unavailable or stale";
        }
      })
    );

    return {
      isListed,
      isResting,
      basket: normalizedBasket,
      currentNav,
      minPackNav: band[0],
      poolMax: band[1],
      tokens: tokenReads,
      basketError,
    };
  } catch (error) {
    return {
      tokens: tokenReads,
      error: errorMessage(error, "Pack chain reads unavailable"),
    };
  }
}

export function PackLifecycleView({
  tokenId,
  values,
  reads,
  plan,
  topUpPhase,
  redemptionPhase,
  topUpConfirmed,
  exitConfirmed,
  isReading,
  isBusy,
  configured,
  onAmountChange,
  onRefresh,
  onTopUp,
  onRetrySync,
  onRedeem,
  onRetryRedeem,
}: ViewProps) {
  const topUpHash = phaseHash(topUpPhase);
  const redemptionHash = phaseHash(redemptionPhase);
  const showTopUpErrors = Object.values(values).some((value) => value.trim());
  const canTopUp = reads.isListed === true && reads.isResting === true;
  const canRedeem = reads.isListed === true;

  return (
    <div className="mt-3 border border-[var(--t-divider)]/50 bg-[var(--t-panel)]/30 p-3">
      {!configured ? (
        <p role="alert" className="text-xs text-[var(--t-red)]">
          Robinhood testnet contract addresses are not configured.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--t-muted)]">Live contract state</span>
            <span className="font-bold uppercase text-[var(--t-text)]">
              {reads.isListed === undefined
                ? "Reading…"
                : reads.isListed
                  ? reads.isResting
                    ? "Listed · Resting"
                    : "Listed · Exited"
                  : "Not listed"}
            </span>
          </div>

          {reads.basket && reads.basket.length > 0 && (
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Live basket:{" "}
              {reads.basket
                .map((entry) => {
                  const symbol =
                    stockSymbolForAddress(entry.asset) ??
                    `${entry.asset.slice(0, 6)}…${entry.asset.slice(-4)}`;
                  return `${symbol} ${formatBalance(entry.amount, 18)}`;
                })
                .join(" · ")}
            </p>
          )}

          {canTopUp && !topUpConfirmed && (
            <div className="mt-4 border-t border-[var(--t-divider)]/40 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Additions-only top-up
              </h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => {
                  const tokenRead = reads.tokens[token.symbol] ?? {};
                  return (
                    <label key={token.address} className="text-xs">
                      <span className="flex justify-between gap-2 text-[var(--t-muted)]">
                        <strong className="text-[var(--t-text)]">
                          {token.symbol}
                        </strong>
                        <span>
                          Balance{" "}
                          {formatBalance(tokenRead.balance, token.decimals)}
                        </span>
                      </span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={values[token.symbol] ?? ""}
                        onChange={(event) =>
                          onAmountChange(token.symbol, event.target.value)
                        }
                        disabled={isBusy || tokenRead.approved === false}
                        className="mt-1 min-h-10 w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 text-[var(--t-text)] outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
                      />
                      {tokenRead.approved === false && (
                        <span className="mt-1 block text-[var(--t-red)]">
                          Not currently approved
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-[var(--t-muted)]">
                <p>
                  Live NAV {formatWadUsd(plan.currentNav.toString())} →
                  projected{" "}
                  <strong className="text-[var(--t-accent)]">
                    {formatWadUsd(plan.projectedNav.toString())}
                  </strong>
                </p>
                <p
                  className={
                    plan.eligible
                      ? "text-[var(--t-green)]"
                      : "text-[var(--t-red)]"
                  }
                >
                  {plan.eligible
                    ? "Projected Pack remains eligible"
                    : "Projected Pack is not eligible"}
                </p>
                <p>
                  {plan.approvals.length
                    ? `Approvals required: ${plan.approvals.map((token) => token.symbol).join(", ")}`
                    : "No token approvals currently required."}
                </p>
              </div>

              {showTopUpErrors && plan.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-[var(--t-red)]">
                  {plan.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}

              <GameButton
                className="mt-3"
                onClick={onTopUp}
                disabled={isBusy || isReading || plan.errors.length > 0}
                size="sm"
              >
                [TOP UP + SYNC NAV]
              </GameButton>
              <p
                role={topUpPhase.kind === "error" ? "alert" : "status"}
                className={`mt-2 text-xs ${
                  topUpPhase.kind === "error"
                    ? "text-[var(--t-red)]"
                    : topUpPhase.kind === "complete"
                      ? "text-[var(--t-green)]"
                      : "text-[var(--t-muted)]"
                }`}
              >
                {topUpPhaseMessage(topUpPhase)}
              </p>
              {topUpHash && (
                <a
                  className="text-xs text-[var(--t-accent)] underline underline-offset-4"
                  href={txExplorerUrl(topUpHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View pending transaction
                </a>
              )}
            </div>
          )}

          {topUpConfirmed && topUpPhase.kind === "error" && (
            <div className="mt-4 border border-[var(--t-amber)]/60 bg-[var(--t-accent-soft)] p-3">
              <p className="text-xs text-[var(--t-amber)]">
                Pack #{tokenId.toString()} top-up confirmed on-chain. It will
                not be repeated; only the NAV sync needs recovery.
              </p>
              <GameButton
                className="mt-2"
                onClick={onRetrySync}
                disabled={isBusy}
                variant="secondary"
                size="sm"
              >
                [RETRY NAV SYNC]
              </GameButton>
            </div>
          )}

          <div className="mt-4 border-t border-[var(--t-divider)]/40 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
              Delist and redeem
            </h4>
            <p className="mt-2 text-xs leading-5 text-[var(--t-muted)]">
              Returns the entire live basket and burns this Pack. The protocol
              charges zero redemption fee; your wallet still pays Robinhood
              Chain gas. A resting Pack exits first so pending Acquisition Fees
              crystallize.
            </p>
            <GameButton
              className="mt-3"
              onClick={onRedeem}
              disabled={isBusy || isReading || !canRedeem || exitConfirmed}
              variant="secondary"
              size="sm"
            >
              [DELIST + REDEEM]
            </GameButton>
            {!canRedeem && reads.isListed !== undefined && (
              <p className="mt-2 text-xs text-[var(--t-muted)]">
                This Pack is no longer listed and cannot use Maker redemption.
              </p>
            )}
            <p
              role={redemptionPhase.kind === "error" ? "alert" : "status"}
              className={`mt-2 text-xs ${
                redemptionPhase.kind === "error"
                  ? "text-[var(--t-red)]"
                  : redemptionPhase.kind === "complete"
                    ? "text-[var(--t-green)]"
                    : "text-[var(--t-muted)]"
              }`}
            >
              {redemptionPhaseMessage(redemptionPhase)}
            </p>
            {redemptionHash && (
              <a
                className="text-xs text-[var(--t-accent)] underline underline-offset-4"
                href={txExplorerUrl(redemptionHash)}
                target="_blank"
                rel="noreferrer"
              >
                View pending transaction
              </a>
            )}
          </div>

          {exitConfirmed && redemptionPhase.kind === "error" && (
            <div className="mt-4 border border-[var(--t-amber)]/60 bg-[var(--t-accent-soft)] p-3">
              <p className="text-xs text-[var(--t-amber)]">
                Pack #{tokenId.toString()} pool exit confirmed on-chain. It will
                not be repeated; only redemption needs recovery.
              </p>
              <GameButton
                className="mt-2"
                onClick={onRetryRedeem}
                disabled={isBusy}
                variant="secondary"
                size="sm"
              >
                [RETRY REDEMPTION]
              </GameButton>
            </div>
          )}

          {isReading && (
            <p className="mt-3 text-xs text-[var(--t-muted)]">
              Refreshing live Pack, basket, token, quote, and eligibility data…
            </p>
          )}
          {reads.error && (
            <p role="alert" className="mt-3 text-xs text-[var(--t-red)]">
              Chain reads unavailable: {reads.error}
            </p>
          )}
          <GameButton
            className="mt-3"
            onClick={onRefresh}
            disabled={isBusy || isReading}
            variant="secondary"
            size="sm"
          >
            [REFRESH LIVE STATE]
          </GameButton>
        </>
      )}
    </div>
  );
}

export function PackLifecycleActions({
  tokenId,
  walletAddress,
}: {
  tokenId: number;
  walletAddress: Address;
}) {
  const { wallets } = useWallets();
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);
  const addresses = useMemo(() => {
    try {
      return getContractAddresses();
    } catch {
      return null;
    }
  }, []);
  const packId = BigInt(tokenId);
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
    )
  );
  const [reads, setReads] = useState<PackLifecycleReads>({ tokens: {} });
  const [topUpPhase, setTopUpPhase] = useState<TopUpPhase>({ kind: "idle" });
  const [redemptionPhase, setRedemptionPhase] = useState<RedemptionPhase>({
    kind: "idle",
  });
  const [topUpConfirmed, setTopUpConfirmed] = useState(false);
  const [exitConfirmed, setExitConfirmed] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const readSequence = useRef(0);
  const valueSignature = ROBINHOOD_TESTNET_STOCK_TOKENS.map(
    (token) => values[token.symbol] ?? ""
  ).join("|");

  const refresh = useCallback(async () => {
    if (!addresses || !isOpen) return null;
    const sequence = ++readSequence.current;
    setIsReading(true);
    const next = await readLifecycleState(
      publicClient,
      addresses,
      walletAddress,
      packId,
      values
    );
    if (sequence === readSequence.current) {
      setReads(next);
      setIsReading(false);
    }
    return next;
  }, [addresses, isOpen, packId, publicClient, values, walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timeout);
  }, [isOpen, refresh, valueSignature]);

  const plan = useMemo(
    () =>
      buildTopUpPlan(
        topUpInputs(values, reads),
        reads.currentNav,
        reads.minPackNav,
        reads.poolMax,
        reads.basketError
      ),
    [reads, values]
  );

  async function adaptersForConnectedWallet(): Promise<{
    topUp: TopUpTransactionAdapter;
    redemption: RedemptionTransactionAdapter;
  }> {
    const wallet = wallets.find(
      (candidate) =>
        candidate.address.toLowerCase() === walletAddress.toLowerCase()
    );
    if (!wallet) throw new Error("Connected Privy EVM wallet is unavailable");
    if (!addresses) throw new Error("Contract addresses are not configured");
    const provider = await wallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: walletAddress,
      chain: PAYMENT_CHAIN,
      transport: custom(provider),
    });
    const waitForReceipt = (hash: Hash) =>
      publicClient.waitForTransactionReceipt({ hash });

    return {
      topUp: {
        approve: (token, amount) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [addresses.packCustody, amount],
          }),
        topUp: (id, assets, amounts) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: addresses.packCustody,
            abi: packCustodyAbi,
            functionName: "topUp",
            args: [id, assets, amounts],
          }),
        syncPackNav: (id) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: addresses.ripEngine,
            abi: ripEngineAbi,
            functionName: "syncPackNav",
            args: [id],
          }),
        waitForReceipt,
      },
      redemption: {
        exitPool: (id) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: addresses.ripEngine,
            abi: ripEngineAbi,
            functionName: "exitPool",
            args: [id],
          }),
        delistAndRedeem: (id) =>
          walletClient.writeContract({
            account: walletAddress,
            chain: PAYMENT_CHAIN,
            address: addresses.packCustody,
            abi: packCustodyAbi,
            functionName: "delistAndRedeem",
            args: [id],
          }),
        waitForReceipt,
      },
    };
  }

  async function onTopUp() {
    if (!addresses || isBusy || topUpConfirmed) return;
    setIsBusy(true);
    setTopUpPhase({ kind: "idle" });
    try {
      const freshReads = await readLifecycleState(
        publicClient,
        addresses,
        walletAddress,
        packId,
        values
      );
      setReads(freshReads);
      if (freshReads.isListed !== true || freshReads.isResting !== true) {
        throw new Error("Pack must be live, listed, and resting to top up");
      }
      const freshPlan = buildTopUpPlan(
        topUpInputs(values, freshReads),
        freshReads.currentNav,
        freshReads.minPackNav,
        freshReads.poolMax,
        freshReads.basketError
      );
      if (freshPlan.errors.length > 0) {
        throw new Error(freshPlan.errors.join(". "));
      }
      const { topUp } = await adaptersForConnectedWallet();
      await topUpAndSyncPack(packId, freshPlan, topUp, setTopUpPhase, () =>
        setTopUpConfirmed(true)
      );
      setTopUpConfirmed(false);
      setValues(
        Object.fromEntries(
          ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
        )
      );
      await refresh();
    } catch (error) {
      setTopUpPhase({
        kind: "error",
        message: errorMessage(error, "Pack top-up failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function onRetrySync() {
    if (!topUpConfirmed || isBusy) return;
    setIsBusy(true);
    try {
      const { topUp } = await adaptersForConnectedWallet();
      await syncConfirmedTopUp(packId, topUp, setTopUpPhase);
      setTopUpConfirmed(false);
      setValues(
        Object.fromEntries(
          ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
        )
      );
      await refresh();
    } catch (error) {
      setTopUpPhase({
        kind: "error",
        message: errorMessage(error, "Pack NAV sync failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function onRedeem() {
    if (!addresses || isBusy || exitConfirmed) return;
    setIsBusy(true);
    setRedemptionPhase({ kind: "idle" });
    try {
      const freshReads = await readLifecycleState(
        publicClient,
        addresses,
        walletAddress,
        packId,
        values
      );
      setReads(freshReads);
      if (
        freshReads.isListed === undefined ||
        freshReads.isResting === undefined ||
        freshReads.basket === undefined
      ) {
        throw new Error("Live Pack and basket state unavailable");
      }
      const { redemption } = await adaptersForConnectedWallet();
      await exitAndRedeemPack(
        packId,
        {
          isListed: freshReads.isListed,
          isResting: freshReads.isResting,
        },
        redemption,
        setRedemptionPhase,
        () => setExitConfirmed(true)
      );
      setExitConfirmed(false);
      await refresh();
    } catch (error) {
      setRedemptionPhase({
        kind: "error",
        message: errorMessage(error, "Pack redemption failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function onRetryRedeem() {
    if (!exitConfirmed || isBusy) return;
    setIsBusy(true);
    try {
      const { redemption } = await adaptersForConnectedWallet();
      await redeemExitedPack(packId, redemption, setRedemptionPhase);
      setExitConfirmed(false);
      await refresh();
    } catch (error) {
      setRedemptionPhase({
        kind: "error",
        message: errorMessage(error, "Pack redemption failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  if (!isOpen) {
    return (
      <GameButton
        className="mt-3"
        onClick={() => setIsOpen(true)}
        variant="secondary"
        size="sm"
      >
        [MANAGE PACK]
      </GameButton>
    );
  }

  return (
    <PackLifecycleView
      tokenId={packId}
      values={values}
      reads={reads}
      plan={plan}
      topUpPhase={topUpPhase}
      redemptionPhase={redemptionPhase}
      topUpConfirmed={topUpConfirmed}
      exitConfirmed={exitConfirmed}
      isReading={isReading}
      isBusy={isBusy}
      configured={Boolean(addresses)}
      onAmountChange={(symbol, value) => {
        setValues((current) => ({ ...current, [symbol]: value }));
        setReads((current) => ({
          ...current,
          tokens: {
            ...current.tokens,
            [symbol]: {
              ...current.tokens[symbol],
              quote: undefined,
              quoteError: undefined,
            },
          },
        }));
      }}
      onRefresh={() => void refresh()}
      onTopUp={() => void onTopUp()}
      onRetrySync={() => void onRetrySync()}
      onRedeem={() => void onRedeem()}
      onRetryRedeem={() => void onRetryRedeem()}
    />
  );
}
