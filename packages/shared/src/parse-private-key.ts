import type { Hex } from "viem";

/** Normalize a private key env value to Hex (adds 0x if missing). */
export function parsePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Private key is empty");
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("Private key must be a 0x-prefixed 32-byte hex string");
  }
  return withPrefix as Hex;
}
