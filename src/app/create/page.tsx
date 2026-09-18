import Link from "next/link";

/** Placeholder until #458 lands the dedicated create flow. */
export default function CreatePositionPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-tight text-[var(--t-accent)]">
          Open Position
        </h1>
        <p className="text-sm leading-6 text-[var(--t-muted)]">
          The dedicated create flow lands next. Choose stock, amount, and
          leverage — then mint a Position NFT on Base.
        </p>
      </header>
      <p className="text-sm leading-6 text-[var(--t-muted)]">
        Create is not available in this slice. Browse your portfolio or the
        protocol explorer in the meantime.
      </p>
      <Link
        href="/"
        className="inline-flex w-fit items-center border border-[var(--t-border)] px-2.5 py-1.5 text-[0.8rem] font-medium text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
      >
        Back to My Positions
      </Link>
    </div>
  );
}
