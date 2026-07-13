/**
 * Resolve an active deployment address from the canonical record.
 * Env vars, if set, must match the canonical value or throw.
 */
export function resolveAddress(
  envValues: readonly (string | undefined)[],
  canonical: `0x${string}`,
  label: string
): `0x${string}` {
  for (const envValue of envValues) {
    if (envValue !== undefined && envValue.trim() !== "") {
      if (envValue.toLowerCase() !== canonical.toLowerCase()) {
        throw new Error(
          `${label} env (${envValue}) does not match active Base Sepolia deployment (${canonical}). Update env or contracts/deployments/base-sepolia.active.json together.`
        );
      }
      return canonical;
    }
  }
  return canonical;
}
