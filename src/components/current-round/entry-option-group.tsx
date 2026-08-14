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
  columns = "auto",
}: {
  legend: string;
  options: readonly bigint[];
  selected: bigint;
  format: (option: bigint) => string;
  onSelect: (option: bigint) => void;
  className?: string;
  /** Equal-width grid on phones; wrap pills from `sm` when `auto`. */
  columns?: 3 | "auto";
}) {
  const optionLayout =
    columns === 3 ? "mt-2 grid grid-cols-3 gap-2" : "mt-2 flex flex-wrap gap-2";

  return (
    <fieldset className={className}>
      <legend className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {legend}
      </legend>
      <div className={optionLayout}>
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-11 border px-2 py-2 text-sm font-bold tabular-nums sm:px-3 ${
                columns === 3 ? "w-full" : ""
              } ${
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
