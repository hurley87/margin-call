"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  PAYMENT_CHAIN,
  PAYMENT_EXPLORER_URL,
  ROBINHOOD_TESTNET_STOCK_TOKENS,
  assetRegistryAbi,
  createRobinhoodPublicClient,
  erc20Abi,
  getPackMintedTokenId,
  packCustodyAbi,
  ripEngineAbi,
  txExplorerUrl,
  type StockToken,
} from "@margin-call/shared";
import {
  createWalletClient,
  custom,
  formatUnits,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { GameButton } from "@/components/ui/game-button";
import { getContractAddresses } from "@/lib/contracts/addresses";
import { formatWadUsd } from "@/lib/pool/nav-distribution";
import {
  buildPackPlan,
  createAndEnrollPack,
  enrollMintedPack,
  parseTokenAmount,
  transactionPhaseMessage,
  type PackPlan,
  type PackTransactionAdapter,
  type TokenAmountInput,
  type TransactionPhase,
} from "@/lib/maker/pack-composer";

const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";

type TokenRead = {
  balance?: bigint;
  allowance?: bigint;
  quote?: bigint;
  quoteError?: string;
};

type ChainReads = {
  tokens: Record<string, TokenRead>;
  minPackNav?: bigint;
  poolMax?: bigint;
  error?: string;
};

type ComposerAddresses = NonNullable<ReturnType<typeof getContractAddresses>>;

type ViewProps = {
  walletAddress: Address;
  values: Record<string, string>;
  reads: ChainReads;
  plan: PackPlan;
  phase: TransactionPhase;
  mintedTokenId: bigint | null;
  isReading: boolean;
  isBusy: boolean;
  configured: boolean;
  onAmountChange: (symbol: string, value: string) => void;
  onRefresh: () => void;
  onSubmit: () => void;
  onRetryEnrollment: () => void;
  onComposeAnother: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message;
    if (/reject|denied|declined/i.test(message)) {
      return `Transaction rejected: ${message}`;
    }
    return message;
  }
  return fallback;
}

function phaseHash(phase: TransactionPhase): Hash | null {
  switch (phase.kind) {
    case "approval-pending":
    case "mint-pending":
    case "enrollment-pending":
      return phase.hash;
    default:
      return null;
  }
}

function formatBalance(value: bigint | undefined, decimals: number): string {
  if (value === undefined) return "Unavailable";
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function inputRows(
  values: Record<string, string>,
  reads: ChainReads
): TokenAmountInput[] {
  return ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => ({
    ...token,
    value: values[token.symbol] ?? "",
    ...reads.tokens[token.symbol],
  }));
}

async function readComposerChainState(
  publicClient: PublicClient,
  addresses: ComposerAddresses,
  walletAddress: Address,
  values: Record<string, string>
): Promise<ChainReads> {
  const tokenReads: Record<string, TokenRead> = {};

  try {
    const [band, balancesAndAllowances] = await Promise.all([
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

    for (const { token, balance, allowance } of balancesAndAllowances) {
      tokenReads[token.symbol] = { balance, allowance };
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
      tokens: tokenReads,
      minPackNav: band[0],
      poolMax: band[1],
    };
  } catch (error) {
    return {
      tokens: tokenReads,
      error: errorMessage(error, "Chain reads unavailable"),
    };
  }
}

function makeTransactionAdapter(
  publicClient: PublicClient,
  walletClient: ReturnType<typeof createWalletClient>,
  walletAddress: Address,
  addresses: ComposerAddresses
): PackTransactionAdapter {
  return {
    approve: (token, amount) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.packCustody, amount],
      }),
    mint: (assets, amounts) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: addresses.packCustody,
        abi: packCustodyAbi,
        functionName: "mint",
        args: [assets, amounts],
      }),
    enterPool: (tokenId) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: addresses.ripEngine,
        abi: ripEngineAbi,
        functionName: "enterPool",
        args: [tokenId],
      }),
    waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
    getMintedTokenId: (receipt: TransactionReceipt) =>
      getPackMintedTokenId(receipt, addresses.packCustody),
  };
}

export function PackComposerView({
  walletAddress,
  values,
  reads,
  plan,
  phase,
  mintedTokenId,
  isReading,
  isBusy,
  configured,
  onAmountChange,
  onRefresh,
  onSubmit,
  onRetryEnrollment,
  onComposeAnother,
}: ViewProps) {
  const hash = phaseHash(phase);
  const showErrors = Object.values(values).some((value) => value.trim());

  return (
    <section className="mt-10" aria-labelledby="pack-composer-heading">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
        Maker
      </p>
      <h2
        id="pack-composer-heading"
        className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase text-[var(--t-accent)]"
      >
        Compose a Pack
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--t-muted)]">
        The Starter Grant is MockUSD for Rips. It does not fund Maker Stock
        Token inventory. Get Robinhood testnet Stock Tokens and gas from the{" "}
        <a
          className="text-[var(--t-accent)] underline underline-offset-4"
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
        >
          Robinhood faucet
        </a>
        .
      </p>

      {!configured ? (
        <p role="alert" className="mt-4 text-sm text-[var(--t-red)]">
          Robinhood testnet contract addresses are not configured.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => {
              const tokenRead = reads.tokens[token.symbol] ?? {};
              const parsed = parseTokenAmount(
                values[token.symbol] ?? "",
                token.decimals
              );
              const inputError =
                values[token.symbol]?.trim() && !parsed.ok
                  ? parsed.error
                  : null;
              return (
                <div
                  key={token.address}
                  className="grid gap-2 border border-[var(--t-divider)]/50 bg-[var(--t-panel)]/40 p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                >
                  <label
                    htmlFor={`pack-${token.symbol}`}
                    className="font-bold text-[var(--t-accent)]"
                  >
                    {token.symbol}
                  </label>
                  <input
                    id={`pack-${token.symbol}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={values[token.symbol] ?? ""}
                    onChange={(event) =>
                      onAmountChange(token.symbol, event.target.value)
                    }
                    disabled={isBusy}
                    aria-describedby={`pack-${token.symbol}-details`}
                    className="min-h-11 border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 text-[var(--t-text)] outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
                  />
                  <div
                    id={`pack-${token.symbol}-details`}
                    className="text-xs text-[var(--t-muted)] sm:text-right"
                  >
                    <p>
                      Balance {formatBalance(tokenRead.balance, token.decimals)}
                    </p>
                    <p>
                      Allowance{" "}
                      {formatBalance(tokenRead.allowance, token.decimals)}
                    </p>
                    {tokenRead.quote !== undefined && (
                      <p className="text-[var(--t-green)]">
                        Quote {formatWadUsd(tokenRead.quote.toString())}
                      </p>
                    )}
                    {inputError && (
                      <p className="text-[var(--t-red)]">{inputError}</p>
                    )}
                    {tokenRead.quoteError && (
                      <p className="text-[var(--t-red)]">
                        Quote unavailable or stale
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border border-[var(--t-divider)]/50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Quoted basket NAV</span>
              <strong className="text-[var(--t-accent)]">
                {formatWadUsd(plan.nav.toString())}
              </strong>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--t-muted)]">
              <span>
                Live band{" "}
                {reads.minPackNav === undefined
                  ? "—"
                  : formatWadUsd(reads.minPackNav.toString())}
                {" → "}
                {reads.poolMax === undefined
                  ? "—"
                  : formatWadUsd(reads.poolMax.toString())}
              </span>
              <span
                className={
                  plan.eligible
                    ? "font-bold text-[var(--t-green)]"
                    : "font-bold text-[var(--t-red)]"
                }
              >
                {plan.eligible ? "Inside eligibility band" : "Not eligible"}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              {plan.approvals.length === 0
                ? "No token approvals currently required."
                : `Approvals required: ${plan.approvals
                    .map((token) => token.symbol)
                    .join(", ")}`}
            </p>
          </div>

          {isReading && (
            <p className="mt-3 text-xs text-[var(--t-muted)]">
              Refreshing live balances, allowances, quotes, and band…
            </p>
          )}
          {reads.error && (
            <p role="alert" className="mt-3 text-sm text-[var(--t-red)]">
              Chain reads unavailable: {reads.error}
            </p>
          )}
          {showErrors && plan.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--t-red)]">
              {plan.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <GameButton
              onClick={onSubmit}
              disabled={
                isBusy || isReading || plan.errors.length > 0 || !!mintedTokenId
              }
            >
              {isBusy ? "[TRANSACTION IN PROGRESS]" : "[MINT + ENTER POOL]"}
            </GameButton>
            <GameButton
              onClick={onRefresh}
              disabled={isBusy || isReading}
              variant="secondary"
            >
              [REFRESH CHAIN READS]
            </GameButton>
          </div>

          <p
            role={phase.kind === "error" ? "alert" : "status"}
            className={`mt-4 text-sm ${
              phase.kind === "error"
                ? "text-[var(--t-red)]"
                : phase.kind === "complete"
                  ? "text-[var(--t-green)]"
                  : "text-[var(--t-muted)]"
            }`}
          >
            {transactionPhaseMessage(phase)}
          </p>
          {hash && (
            <a
              className="mt-1 inline-block text-xs text-[var(--t-accent)] underline underline-offset-4"
              href={txExplorerUrl(hash)}
              target="_blank"
              rel="noreferrer"
            >
              View pending transaction
            </a>
          )}

          {mintedTokenId !== null && phase.kind === "error" && (
            <div className="mt-4 border border-[var(--t-amber)]/60 bg-[var(--t-accent-soft)] p-4">
              <p className="text-sm text-[var(--t-amber)]">
                Pack #{mintedTokenId.toString()} was confirmed on-chain. It was
                not rolled back and will not be reminted.
              </p>
              <GameButton
                className="mt-3"
                onClick={onRetryEnrollment}
                disabled={isBusy}
                variant="secondary"
                size="sm"
              >
                [RETRY POOL ENROLLMENT]
              </GameButton>
            </div>
          )}

          {phase.kind === "complete" && (
            <GameButton
              className="mt-4"
              onClick={onComposeAnother}
              variant="secondary"
              size="sm"
            >
              [COMPOSE ANOTHER PACK]
            </GameButton>
          )}

          <p className="mt-3 text-[10px] text-[var(--t-muted)]">
            Wallet {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)} ·{" "}
            <a
              className="hover:underline"
              href={PAYMENT_EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Robinhood testnet explorer
            </a>
          </p>
        </>
      )}
    </section>
  );
}

export function PackComposer({ walletAddress }: { walletAddress: Address }) {
  const { wallets } = useWallets();
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);
  const addresses = useMemo(() => {
    try {
      return getContractAddresses();
    } catch {
      return null;
    }
  }, []);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
    )
  );
  const [reads, setReads] = useState<ChainReads>({ tokens: {} });
  const [phase, setPhase] = useState<TransactionPhase>({ kind: "idle" });
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const readSequence = useRef(0);
  const valueSignature = ROBINHOOD_TESTNET_STOCK_TOKENS.map(
    (token) => values[token.symbol] ?? ""
  ).join("|");

  const refresh = useCallback(async () => {
    if (!addresses) return null;
    const sequence = ++readSequence.current;
    setIsReading(true);
    const next = await readComposerChainState(
      publicClient,
      addresses,
      walletAddress,
      values
    );
    if (sequence === readSequence.current) {
      setReads(next);
      setIsReading(false);
    }
    return next;
  }, [addresses, publicClient, walletAddress, values]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timeout);
  }, [refresh, valueSignature]);

  const plan = useMemo(
    () =>
      buildPackPlan(inputRows(values, reads), reads.minPackNav, reads.poolMax),
    [reads, values]
  );

  async function adapterForConnectedWallet() {
    const wallet = wallets.find(
      (candidate) =>
        candidate.address.toLowerCase() === walletAddress.toLowerCase()
    );
    if (!wallet) throw new Error("Connected Privy EVM wallet is unavailable");
    const provider = await wallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: walletAddress,
      chain: PAYMENT_CHAIN,
      transport: custom(provider),
    });
    if (!addresses) throw new Error("Contract addresses are not configured");
    return makeTransactionAdapter(
      publicClient,
      walletClient,
      walletAddress,
      addresses
    );
  }

  async function onSubmit() {
    if (!addresses || isBusy || mintedTokenId !== null) return;
    setIsBusy(true);
    setPhase({ kind: "idle" });
    try {
      const freshReads = await readComposerChainState(
        publicClient,
        addresses,
        walletAddress,
        values
      );
      setReads(freshReads);
      const freshPlan = buildPackPlan(
        inputRows(values, freshReads),
        freshReads.minPackNav,
        freshReads.poolMax
      );
      if (freshPlan.errors.length > 0) {
        throw new Error(freshPlan.errors.join(". "));
      }
      const adapter = await adapterForConnectedWallet();
      await createAndEnrollPack(freshPlan, adapter, setPhase, setMintedTokenId);
      await refresh();
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Pack creation failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function onRetryEnrollment() {
    if (mintedTokenId === null || isBusy) return;
    setIsBusy(true);
    try {
      const adapter = await adapterForConnectedWallet();
      await enrollMintedPack(mintedTokenId, adapter, setPhase);
      await refresh();
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Pool enrollment failed"),
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PackComposerView
      walletAddress={walletAddress}
      values={values}
      reads={reads}
      plan={plan}
      phase={phase}
      mintedTokenId={mintedTokenId}
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
      onSubmit={() => void onSubmit()}
      onRetryEnrollment={() => void onRetryEnrollment()}
      onComposeAnother={() => {
        setValues(
          Object.fromEntries(
            ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
          )
        );
        setMintedTokenId(null);
        setPhase({ kind: "idle" });
      }}
    />
  );
}

export type { ChainReads, TokenRead, StockToken };
