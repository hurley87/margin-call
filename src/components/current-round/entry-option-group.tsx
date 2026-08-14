"use client";

/**
 * Shared margin / Arcade Leverage option pills for entry surfaces.
 * Always a 3-column equal-width grid (3 margins; 6 leverage tiers = 3×2).
 */
export function EntryOptionGroup({
  legend,
  options,
  selected,
  format,
  onSelect,
  className = "mt-3",
}: {
  legend: string;
  options: readonly bigint[];
  selected: bigint;
  format: (option: bigint) => string;
  onSelect: (option: bigint) => void;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {legend}
      </legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-11 w-full border px-2 py-2 text-sm font-bold tabular-nums sm:px-3 ${
                isSelected
                  ? "mc-tier-pop border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-accent)] shadow-[0_0_12px_rgba(214,166,96,0.28)]"
                  : "border-[var(--t-border)] text-[var(--t-text)] hover:border-[var(--t-accent)]"
              }`}
              key={option.toString()}
              onClick={() => onSelect(option)}
              type="button"
            >
              {format(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
