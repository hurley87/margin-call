"use client";

import { formatStockAmount } from "@/lib/protocol/amounts";
import {
  baseDeployment,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import {
  buildUniswapSwapUrl,
  type SwapInputCurrency,
} from "@/lib/uniswap/swap-url";

export type AcquireStockLinksProps = {
  stockName: LaunchAssetName;
  stockAddress: `0x${string}`;
  stockBalance: bigint;
  stockAmount: bigint;
  onRefresh: () => void;
  /** Input-side amount (USDC or ETH) to prefill on Uniswap. */
  suggestedInputAmount?: string;
};

function SwapLink({
  inputCurrency,
  outputCurrency,
  value,
  children,
}: {
  inputCurrency: SwapInputCurrency;
  outputCurrency: `0x${string}`;
  value?: string;
  children: string;
}) {
  return (
    <a
      className="create-acquire-link"
      href={buildUniswapSwapUrl({ inputCurrency, outputCurrency, value })}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

/** Uniswap hand-off for wallets short on the stock they are trying to deposit. */
export function AcquireStockLinks({
  stockName,
  stockAddress,
  stockBalance,
  stockAmount,
  onRefresh,
  suggestedInputAmount,
}: AcquireStockLinksProps) {
  const holdsNone = stockBalance <= 0n;

  return (
    <div
      className={
        holdsNone ? "create-acquire create-acquire-empty" : "create-acquire"
      }
    >
      <p className="create-acquire-note">
        {holdsNone
          ? `You don’t have any ${stockName} yet.`
          : `You need ${formatStockAmount(stockAmount)} ${stockName} but only have ${formatStockAmount(stockBalance)}.`}
      </p>
      <div className="create-acquire-actions">
        <SwapLink
          inputCurrency={baseDeployment.usdc}
          outputCurrency={stockAddress}
          value={suggestedInputAmount}
        >
          {holdsNone ? `Buy ${stockName} with USDC` : "Buy with USDC"}
        </SwapLink>
        <SwapLink
          inputCurrency="ETH"
          outputCurrency={stockAddress}
          value={suggestedInputAmount}
        >
          {holdsNone ? `Buy ${stockName} with ETH` : "Buy with ETH"}
        </SwapLink>
      </div>
      <p className="create-acquire-refresh">
        {holdsNone ? <span>Already swapped?</span> : null}
        <button type="button" onClick={onRefresh}>
          Refresh balance
        </button>
      </p>
    </div>
  );
}
