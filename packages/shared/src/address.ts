export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Parse a 0x-prefixed 20-byte address from an env-style string, or undefined. */
export function parseAddress(
  value: string | undefined
): `0x${string}` | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!ADDRESS_RE.test(trimmed)) {
    throw new Error("must be a 0x-prefixed 20-byte address");
  }
  return trimmed as `0x${string}`;
}

/**
 * Require a valid address from `process.env[envKey]`.
 * `context` (e.g. "Convex env") qualifies the "is not set" message for the caller.
 */
export function requireEnvAddress(
  envKey: string,
  context?: string
): `0x${string}` {
  const value = process.env[envKey]?.trim();
  if (!value) {
    throw new Error(`${envKey} is not set${context ? ` in ${context}` : ""}`);
  }
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`${envKey} must be a 0x-prefixed 20-byte address`);
  }
  return value as `0x${string}`;
}

/** Normalize and validate an EVM address (lowercase). */
export function normalizeWalletAddress(address: string): `0x${string}` {
  const trimmed = address.trim();
  if (!ADDRESS_RE.test(trimmed)) {
    throw new Error("Invalid wallet address");
  }
  return trimmed.toLowerCase() as `0x${string}`;
}
