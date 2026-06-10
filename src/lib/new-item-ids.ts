/**
 * Pure diff for "which ids are new since the last subscription result",
 * used to animate feed/wire arrivals. Extracted for unit testing.
 */
export function collectNewIds(
  seen: ReadonlySet<string>,
  ids: readonly string[]
): { fresh: Map<string, number>; seen: Set<string> } {
  const nextSeen = new Set(seen);
  const fresh = new Map<string, number>();
  let burstIndex = 0;
  for (const id of ids) {
    if (nextSeen.has(id)) continue;
    fresh.set(id, burstIndex);
    burstIndex += 1;
    nextSeen.add(id);
  }
  return { fresh, seen: nextSeen };
}
