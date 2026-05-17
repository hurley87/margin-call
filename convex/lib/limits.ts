/**
 * Clamp a caller-supplied limit into `[min, max]`. Used by paginated query
 * endpoints to bound `.take()` reads against an absolute ceiling regardless
 * of what a buggy or hostile caller asks for.
 */
export function clampLimit(limit: number, max: number, min = 1): number {
  return Math.max(min, Math.min(limit, max));
}
