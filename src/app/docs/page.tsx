import type { Metadata } from "next";
import Image from "next/image";
import {
  DocsAssetCard,
  DocsDivider,
  DocsStepNumber,
} from "@/components/docs/docs-sketch";
import "./docs.css";

export const metadata: Metadata = {
  title: "Docs | Margin Call",
  description:
    "Learn how Margin Call positions work: Coinbase tokenized stocks, borrowing, pricing, and your living Position NFT on Base.",
};

const steps = [
  {
    title: "Deposit",
    description:
      "Deposit a Coinbase tokenized stock on Base, such as NVDAc — not the listed share.",
    image: "step-deposit-stock.png",
    width: 170,
    alt: "An illustrated NVDAc stock token",
  },
  {
    title: "Borrow",
    description:
      "Borrow USDC against your collateral. Choose 1.0x to open without borrowing.",
    image: "step-borrow-usdc.png",
    width: 180,
    alt: "A stack of blue USDC coins",
  },
  {
    title: "Get more of the same",
    description:
      "Borrowed USDC buys more of your position’s same stock. It cannot be withdrawn as cash.",
    image: "step-more-same-stock.png",
    width: 195,
    alt: "A growing stack of NVDAc stock tokens",
  },
  {
    title: "Your position NFT",
    description:
      "You get a living puppy NFT: stock, debt, and an optional thesis, all onchain.",
    image: "position-nft-card.png",
    width: 180,
    alt: "An illustrated NVDAc Position NFT with a puppy and 1.5x leverage",
  },
] as const;

const assets = [
  { symbol: "NVDAc", logo: "nvda", name: "NVIDIA" },
  { symbol: "AAPLc", logo: "aapl", name: "Apple" },
  { symbol: "METAc", logo: "meta", name: "Meta" },
  { symbol: "GOOGLc", logo: "googl", name: "Alphabet" },
] as const;

const faqs = [
  {
    question: "Can I close my position anytime?",
    answer:
      "Close once all USDC principal and accrued interest are repaid. Closing returns the remaining stock and burns the NFT. Repaying with USDC from your wallet does not need a live price feed.",
  },
  {
    question: "What happens if my position is liquidated?",
    answer:
      "A financed position can be liquidated when pricing is live and equity is below 30% of its stock value. The NFT is burned. Leftover USDC after debt goes to the owner. A shortfall is absorbed by the protocol — it is not a personal debt. 1.0x positions cannot be liquidated.",
  },
  {
    question: "What are the fees?",
    answer:
      "Borrowing accrues simple interest at a fixed 10% APR on outstanding principal. A 1.0x position has no borrowing interest. Swaps incur venue fees and may have price impact; transactions also require Base network gas.",
  },
  {
    question: "Where do the prices come from?",
    answer:
      "Chainlink total-return price feeds value the stock for position health and solvency. Actual purchases and sales execute through Uniswap V3, where execution prices can differ from the oracle price. Actions that need pricing require a valid, live feed.",
  },
  {
    question: "Can I sell my position NFT?",
    answer:
      "The NFT is transferable using standard ERC-721 transfers. Control of the existing position passes to the new owner, with the stock and debt unchanged. Margin Call does not currently provide listings, bids, or purchase settlement, and does not guarantee a secondary market.",
  },
  {
    question: "What tokenized stocks are supported?",
    answer:
      "Coinbase tokenized equities on Base: NVDAc, AAPLc, METAc, and GOOGLc. Deposit those tokens, not NVDA, AAPL, META, or GOOGL. Each position holds one stock, and any borrowed USDC buys more of that same stock.",
  },
] as const;

export default function DocsPage() {
  return (
    <article className="docs-page" aria-labelledby="docs-title">
      <header className="docs-hero">
        <div>
          <h1 id="docs-title">Docs</h1>
          <p>
            Everything you need to know about
            <br className="docs-desktop-break" /> Margin Call.
          </p>
        </div>
        <Image
          className="docs-art docs-hero-art"
          src="/docs/docs-hero-puppy-books.png"
          width={475}
          height={305}
          sizes="(max-width: 700px) 90vw, 475px"
          preload
          alt="A puppy beside books about stocks, onchain, and bigger possibilities. Same stocks. New possibilities."
        />
      </header>

      <DocsDivider />

      <section className="docs-intro docs-pair" aria-labelledby="docs-about">
        <div>
          <h2 id="docs-about">What is Margin Call?</h2>
          <p>
            Margin Call lets you create positions in Coinbase tokenized stocks
            on Base. Deposit a supported token such as NVDAc as collateral and,
            if you want, borrow USDC to buy more of the same stock.
          </p>
          <p>
            Each position is a living NFT — a puppy that changes with your
            health, plus an optional onchain thesis. You can hold it, repay it,
            close it, or transfer it.
          </p>
        </div>
        <Image
          className="docs-art docs-flow-art"
          src="/docs/leverage-flow.png"
          width={480}
          height={215}
          sizes="(max-width: 700px) 90vw, 480px"
          alt="Deposit one NVDAc, borrow USDC, and get more NVDAc"
        />
      </section>

      <DocsDivider />

      <section className="docs-how" aria-labelledby="docs-how-title">
        <h2 id="docs-how-title">How it works</h2>
        <ol className="docs-steps">
          {steps.map((step, index) => (
            <li className="docs-step" key={step.title}>
              <div className="docs-step-heading">
                <DocsStepNumber>{index + 1}</DocsStepNumber>
                <h3>{step.title}</h3>
              </div>
              <p>{step.description}</p>
              <Image
                className="docs-art docs-step-art"
                src={`/docs/${step.image}`}
                width={step.width}
                height={170}
                sizes="170px"
                alt={step.alt}
              />
            </li>
          ))}
        </ol>
        <div className="docs-borrow-note">
          <p>
            Pick leverage when you open: 1.0x, 1.1x, 1.25x, 1.4x, or 1.5x. You
            cannot increase it later. 1.0x has no borrow interest and cannot be
            liquidated. Borrowing increases both exposure and risk: a financed
            position can be liquidated if its equity falls below 30% of its
            stock value.
          </p>
          <p>
            After you open, repay USDC to clear interest then principal. Once
            debt is zero, close returns the remaining stock and burns the NFT.
          </p>
        </div>
      </section>

      <DocsDivider />

      <div className="docs-pair docs-split">
        <section aria-labelledby="docs-pricing">
          <h2 id="docs-pricing">Pricing</h2>
          <p>
            Chainlink total-return price feeds value your tokenized stocks and
            determine position health. Stock purchases and sales execute through
            Uniswap V3.
          </p>
          <div className="docs-chainlink">
            <span className="docs-chainlink-mark" aria-hidden="true" />
            <span>Chainlink</span>
            <span className="docs-pricing-note">
              Stock prices.
              <br />
              Onchain.
            </span>
          </div>
        </section>
        <section className="docs-nft" aria-labelledby="docs-nfts">
          <div>
            <h2 id="docs-nfts">Position NFTs</h2>
            <p>A living puppy for your position, onchain.</p>
            <ul className="docs-checks">
              <li>A puppy that changes with position health</li>
              <li>Optional thesis, immutable once minted</li>
              <li>Transfer control to another wallet</li>
              <li>One NFT. One stock. Stock and debt stay put.</li>
            </ul>
            <p className="docs-small">
              An optional thesis (up to 280 bytes) is recorded when you open. It
              cannot be edited later, and it remains readable after close or
              liquidation.
            </p>
            <p className="docs-small">
              Transfers are supported; a built-in marketplace is not yet
              available.
            </p>
          </div>
          <Image
            className="docs-art docs-signpost"
            src="/docs/position-nft-signpost.png"
            width={150}
            height={210}
            sizes="120px"
            alt="Hand-drawn signpost pointing to hold, sell, and transfer"
          />
        </section>
      </div>

      <DocsDivider />

      <div className="docs-pair docs-split docs-bottom">
        <section aria-labelledby="docs-assets">
          <h2 id="docs-assets">Supported Assets</h2>
          <p>
            Four Coinbase tokenized stocks, live on Base — not the listed
            shares. Each position holds one stock from the current supported
            set.
          </p>
          <ul className="docs-assets">
            {assets.map((asset) => (
              <li key={asset.symbol}>
                <DocsAssetCard>
                  <Image
                    src={`/logos/${asset.logo}.png`}
                    width={36}
                    height={36}
                    alt={asset.name}
                  />
                  <span>{asset.symbol}</span>
                </DocsAssetCard>
              </li>
            ))}
          </ul>
        </section>
        <section className="docs-faq" aria-labelledby="docs-faq-title">
          <h2 id="docs-faq-title">FAQ</h2>
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <span className="docs-chevron" aria-hidden="true" />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>
      </div>
    </article>
  );
}
