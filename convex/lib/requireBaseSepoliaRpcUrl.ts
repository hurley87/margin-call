/**
 * Require an explicit Base Sepolia RPC URL for financial and auth reads.
 * Fails closed — no implicit public RPC fallback.
 */
export function requireBaseSepoliaRpcUrl(): string {
  const url =
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;

  if (!url || url.trim() === "") {
    throw new Error(
      "Base Sepolia RPC URL is required. Set BASE_SEPOLIA_RPC_URL (Convex) or NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL (Next.js) to a Base Sepolia JSON-RPC endpoint."
    );
  }

  try {
    new URL(url.trim());
  } catch {
    throw new Error(`Malformed Base Sepolia RPC URL: ${url}`);
  }

  return url.trim();
}
