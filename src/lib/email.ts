/**
 * Canonical email normalization. Returns `undefined` for blank/missing input
 * so callers can use the result directly as an optional field value.
 */
export function normalizeEmail(email: string | null | undefined) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}
