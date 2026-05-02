"use client";

/**
 * Realtime subscription hooks — replaced by Convex's built-in reactivity.
 *
 * These stubs keep call sites compiling while the UI migrates to Convex
 * `useQuery` subscriptions. They are intentional no-ops: Convex's reactive
 * queries update the UI automatically without any TanStack Query cache
 * invalidation or Supabase channel wiring.
 *
 * Remove callers once the corresponding pages are fully ported to Convex hooks.
 */

/** @deprecated No-op — Convex reactivity replaces Supabase Realtime. */
export function useRealtimeInvalidation() {}

/** @deprecated No-op — use Convex useQuery for deal state. */
export function useDealsRealtime() {}

/** @deprecated No-op — use Convex useQuery for deal state. */
export function useDealRealtime(_dealId: string) {}

/** @deprecated No-op — use Convex useQuery for approvals. */
export function useApprovalsRealtime() {}

/** @deprecated No-op — use Convex useQuery for trader state. */
export function useTraderRealtime(_traderId: string) {}

/** @deprecated No-op — use Convex useQuery for dashboard state. */
export function useDashboardRealtime() {}

/** @deprecated No-op — use Convex useQuery for narrative state. */
export function useNarrativeRealtime() {}

/** @deprecated No-op — use Convex useQuery for leaderboard state. */
export function useLeaderboardRealtime() {}
