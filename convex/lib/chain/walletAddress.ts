const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Normalize and validate an EVM address (lowercase). */
export function normalizeWalletAddress(address: string): `0x${string}` {
  const trimmed = address.trim();
  if (!ADDRESS_RE.test(trimmed)) {
    throw new Error("Invalid wallet address");
  }
  return trimmed.toLowerCase() as `0x${string}`;
}
