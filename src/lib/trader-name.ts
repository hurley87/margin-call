export const TRADER_NAME_MAX = 15;
export const TRADER_NAME_REGEX = /^[A-Za-z0-9_]{1,15}$/;

export function validateTraderName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return "Name required";
  if (name.length > TRADER_NAME_MAX) return `Max ${TRADER_NAME_MAX} characters`;
  if (!TRADER_NAME_REGEX.test(name)) return "Letters, numbers, and _ only";
  return null;
}
