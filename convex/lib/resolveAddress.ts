/**
 * Resolve an active deployment address from the canonical record.
 * Env vars, if set, must match the canonical value or throw.
 */
export function resolveAddress(
  envValues: readonly (string | undefined)[],
  canonical: `0x${string}`,
  label: string,
  networkLabel = "active deployment"
): `0x${string}` {
  for (const envValue of envValues) {
    if (envValue !== undefined && envValue.trim() !== "") {
      if (envValue.toLowerCase() !== canonical.toLowerCase()) {
        throw new Error(
          `${label} env (${envValue}) does not match ${networkLabel} (${canonical}). Update env or the canonical deployment record together.`
        );
      }
      return canonical;
    }
  }
  return canonical;
}
