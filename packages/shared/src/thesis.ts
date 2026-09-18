/**
 * Opening thesis limits, shared by the create form and the NFT metadata route.
 * Mirrors `MarginCall.MAX_THESIS_BYTES` — the contract is authoritative, so any
 * client that disagrees only produces a reverted transaction.
 */

export const MAX_THESIS_BYTES = 280;

const encoder = new TextEncoder();

/** UTF-8 byte length, which is what the contract measures — not character count. */
export function thesisByteLength(thesis: string): number {
  return encoder.encode(thesis).length;
}

export function isThesisWithinLimit(thesis: string): boolean {
  return thesisByteLength(thesis) <= MAX_THESIS_BYTES;
}
