"use client";

/**
 * Shared margin / Arcade Leverage option pills for entry surfaces.
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
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-11 border px-3 py-2 text-sm font-bold tabular-nums ${
                isSelected
                  ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
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
