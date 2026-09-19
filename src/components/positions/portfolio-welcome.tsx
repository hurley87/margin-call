import Image from "next/image";
import { roughRoundedRect } from "drawably";
import Link from "next/link";
import { PlayfulIcon } from "@/components/ui/playful-icon";

const FEATURES = [
  {
    icon: "chart",
    title: "Long your favorite stocks",
    description: "Use your assets as collateral to go long.",
  },
  {
    icon: "paw",
    title: "Collect puppies",
    description: "Each position is a unique puppy with a life of its own.",
  },
  {
    icon: "shield",
    title: "Stay in control",
    description: "Repay and manage your position anytime.",
  },
  {
    icon: "heart",
    title: "Same stocks. More fun.",
    description: "A more playful way to put your capital to work.",
  },
] as const;

const ctaOutline = roughRoundedRect(3, 3, 374, 70, 35, {
  seed: 42,
  roughness: 0.7,
});

export function OpenPositionCta() {
  return (
    <Link href="/create" className="portfolio-open-cta">
      <svg
        className="portfolio-cta-sketch"
        viewBox="0 0 380 76"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={ctaOutline} />
      </svg>
      <span aria-hidden="true">+</span>Open a Position
    </Link>
  );
}

export function PortfolioActions() {
  return (
    <div className="portfolio-actions">
      <OpenPositionCta />
      <Link href="/docs#agents" className="portfolio-build-cta">
        Build with Margin Call <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}

export function PortfolioWelcome({ empty = false }: { empty?: boolean }) {
  return (
    <div className="portfolio-welcome">
      <Image
        src="/homepage.png"
        width={2172}
        height={724}
        sizes="(max-width: 1400px) 100vw, 1400px"
        preload
        className="portfolio-hero-art"
        alt="A puppy in a green bandana beside an empty bowl marked Positions go here. Let's lever up your tokenized stocks."
      />
      <section className="portfolio-welcome-copy">
        <h1>
          {empty ? "Your portfolio is empty" : "Your next position starts here"}
        </h1>
        <p>
          {empty
            ? "Open your first position to start collecting puppies."
            : "Connect your wallet to see your portfolio and start collecting puppies."}
        </p>
        <PortfolioActions />
      </section>
      <ul className="portfolio-features">
        {FEATURES.map(({ icon, title, description }) => (
          <li
            key={icon}
            className={`portfolio-feature portfolio-feature-${icon}`}
          >
            <PlayfulIcon kind={icon} />
            <h2>{title}</h2>
            <p>{description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
