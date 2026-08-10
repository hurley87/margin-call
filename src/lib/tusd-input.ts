const TUSD_DECIMALS = 6;
const TUSD_SCALE = 10n ** BigInt(TUSD_DECIMALS);

/** Parses a user-entered Desk Dollars amount without floating-point arithmetic. */
export function parseTUsdInput(input: string): bigint | null {
  if (!/^\d+(?:\.\d{0,6})?$/.test(input)) return null;

  const [whole, fraction = ""] = input.split(".");
  return (
    BigInt(whole) * TUSD_SCALE + BigInt(fraction.padEnd(TUSD_DECIMALS, "0"))
  );
}
