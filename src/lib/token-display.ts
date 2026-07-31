import { formatUnits, maxUint256 } from "viem";

const MAX_VISIBLE_FRACTION_DIGITS = 6;
const MAX_VISIBLE_WHOLE_DIGITS = 12;
const SCIENTIFIC_SIGNIFICANT_DIGITS = 6;

export type TokenAmountDisplay = {
  compact: string;
  exact: string;
};

function compactWholeNumber(whole: string, fraction: string): string {
  if (whole.length <= MAX_VISIBLE_WHOLE_DIGITS) return whole;

  const significant = whole.slice(0, SCIENTIFIC_SIGNIFICANT_DIGITS);
  const rest = whole.slice(SCIENTIFIC_SIGNIFICANT_DIGITS);
  const coefficient = `${significant[0]}.${significant.slice(1)}`;
  const omission = /[1-9]/.test(rest) || /[1-9]/.test(fraction) ? "…" : "";
  return `${coefficient}${omission}e+${whole.length - 1}`;
}

function compactFraction(whole: string, fraction: string): string {
  const meaningfulFraction = fraction.replace(/0+$/, "");
  if (!meaningfulFraction) return whole;
  if (meaningfulFraction.length <= MAX_VISIBLE_FRACTION_DIGITS) {
    return `${whole}.${meaningfulFraction}`;
  }

  const visible = meaningfulFraction.slice(0, MAX_VISIBLE_FRACTION_DIGITS);
  if (/[1-9]/.test(visible)) return `${whole}.${visible}…`;

  const firstNonZero = meaningfulFraction.search(/[1-9]/);
  const significant = meaningfulFraction
    .slice(firstNonZero, firstNonZero + SCIENTIFIC_SIGNIFICANT_DIGITS)
    .padEnd(SCIENTIFIC_SIGNIFICANT_DIGITS, "0");
  const rest = meaningfulFraction.slice(
    firstNonZero + SCIENTIFIC_SIGNIFICANT_DIGITS
  );
  const coefficient = `${significant[0]}.${significant.slice(1)}`;
  const omission = /[1-9]/.test(rest) ? "…" : "";
  return `${coefficient}${omission}e-${firstNonZero + 1}`;
}

export function formatTokenAmountDisplay(
  value: bigint | undefined,
  decimals: number
): TokenAmountDisplay {
  if (value === undefined) {
    return { compact: "Unavailable", exact: "Unavailable" };
  }

  const exact = formatUnits(value, decimals);
  const [whole, fraction = ""] = exact.split(".");
  return {
    compact:
      whole.length > MAX_VISIBLE_WHOLE_DIGITS
        ? compactWholeNumber(whole, fraction)
        : compactFraction(whole, fraction),
    exact,
  };
}

export function formatAllowanceDisplay(
  value: bigint | undefined,
  decimals: number
): TokenAmountDisplay {
  if (value === maxUint256) {
    return { compact: "Unlimited", exact: "Unlimited (max uint256)" };
  }
  return formatTokenAmountDisplay(value, decimals);
}
