/**
 * Shorten asset labels for UI (and for normalizing gained assets from the LLM).
 * Strips parenthetical phrases, then keeps at most `maxWords` words.
 */
export function shortAssetLabel(raw: string, maxWords = 3): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let s = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.replace(/\s+\$\s*[\d.]+(?:\s*USDC)?\s*$/i, "").trim();

  const words = s.split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, maxWords).join(" ");
  return clipped || trimmed;
}
