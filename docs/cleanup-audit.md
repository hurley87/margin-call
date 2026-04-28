# Cleanup Audit: Stale TanStack/Realtime Hooks

**Branch:** chore/convex-cleanup-stale-tanstack-hooks  
**Base:** feat/91-supabase-runtime-removal  
**Date:** 2026-04-26

## Summary

PR #91 deleted all Supabase-backed API routes. The following `src/hooks/` files still import
`@tanstack/react-query` and call those deleted routes. There are NO `use-convex-*` replacement
hooks — the Convex API surface (at time of audit) only exposes `me` query (identity).

Since no Convex replacements exist for the data these hooks fetched, **all callers must be
audited and gutted of the now-broken calls**. The strategy: strip broken hook calls from pages/
components (replace with stub/null returns or remove the UI section entirely), then delete the
stale hook files.

## Stale Hooks

| Hook file | API route called | Status of route | Callers | Action |
|---|---|---|---|---|
| `use-activity-feed.ts` | `/api/desk/activity` | DELETED | `src/app/page.tsx` | Delete + gut caller |
| `use-agent.ts` | `/api/trader/{id}/assets`, `/api/trader/{id}/activity`, `/api/trader/{id}/outcomes`, `/api/trader/{id}/pause\|resume\|revive` | DELETED | `src/app/traders/[id]/page.tsx`, `src/components/trader-activity-panel.tsx`, `src/components/feed-line.tsx` | Delete + gut callers |
| `use-approvals.ts` | `/api/desk/approvals`, `/api/desk/approve`, `/api/desk/configure` | DELETED | `src/app/page.tsx`, `src/components/trader-activity-panel.tsx`, `src/components/feed-line.tsx`, `src/components/pending-approval-card.tsx`, `src/components/deal-approval-dialog.tsx` | Delete + gut callers |
| `use-create-trader.ts` | `/api/trader/create` | DELETED | `src/app/traders/new/page.tsx` | Delete + gut caller |
| `use-deals.ts` | `/api/deal/list` (deleted), `/api/deal/my` (deleted), `/api/deal/{id}` (deleted), `/api/prompt/suggest` (KEPT) | MIXED | `src/app/page.tsx`, `src/app/deals/[id]/page.tsx`, `src/components/wire/create-deal-dialog.tsx`, `src/components/wire/wire-feed.tsx`, `src/components/wire/wire-post.tsx`, `src/components/wire/wire-stats-bar.tsx` | Partial: keep `useSuggestPrompts`, delete rest |
| `use-desk.ts` | `/api/desk/register` | DELETED | `src/app/page.tsx` | Delete + gut caller |
| `use-global-activity.ts` | `/api/activity/global` | DELETED | `src/app/leaderboard/page.tsx` | Delete + gut caller |
| `use-leaderboard.ts` | `/api/leaderboard` | DELETED | `src/app/leaderboard/page.tsx` | Delete + gut caller |
| `use-narrative.ts` | `/api/narrative/current`, `/api/narrative/history`, `/api/narrative/feed` | DELETED | `src/app/wire/page.tsx`, `src/components/wire/create-deal-dialog.tsx`, `src/components/wire/wire-feed.tsx`, `src/components/wire/wire-post.tsx` | Delete + gut callers |
| `use-portfolio.ts` | `/api/desk/portfolio` | DELETED | `src/app/page.tsx` | Delete + gut caller |
| `use-realtime.ts` | Supabase client (deleted) — no API route, uses `createBrowserClient` | N/A (Supabase removed) | `src/app/traders/[id]/page.tsx`, `src/app/wire/page.tsx`, `src/app/deals/[id]/page.tsx`, `src/app/leaderboard/page.tsx`, `src/app/page.tsx` | Delete + remove all import sites |
| `use-settings.ts` | `/api/desk/settings` | DELETED | None found (no callers) | Delete directly |
| `use-traders.ts` | `/api/trader/list`, `/api/trader/{id}`, `/api/trader/{id}/history` | DELETED | `src/app/page.tsx`, `src/app/traders/page.tsx`, `src/app/traders/new/page.tsx`, `src/app/traders/[id]/page.tsx` | Delete + gut callers |

## Files also using `use-realtime` import (via `use-realtime.ts`)

- `src/app/traders/[id]/page.tsx` — imports `useTraderRealtime`
- `src/app/wire/page.tsx` — imports `useNarrativeRealtime`
- `src/app/deals/[id]/page.tsx` — imports `useDealRealtime`
- `src/app/leaderboard/page.tsx` — imports `useLeaderboardRealtime`
- `src/app/page.tsx` — imports `useDashboardRealtime`

## TanStack Query in non-hook files

`@tanstack/react-query` is also used directly in:
- `src/app/traders/[id]/page.tsx` — `useQueryClient`
- `src/app/deals/[id]/page.tsx` — `useQueryClient`, `useMutation` (for deal sync — `/api/deal/sync` exists but is stale)
- `src/components/providers/privy-provider.tsx` — wraps app in `QueryClientProvider`

Once all hooks are removed, `QueryClientProvider` in `privy-provider.tsx` can be removed.

## Convex Replacement Gap

**There are no Convex query functions for**: traders, deals, activity, portfolio, approvals,
leaderboard, narrative. The Convex backend only has `me` (identity). This is a deliberate gap
per PRD — flagging for human follow-up.

All callers will be gutted to return placeholder/empty state.

## Execution Order

1. Delete `use-settings.ts` (no callers) — easy win
2. Delete `use-realtime.ts` + remove all realtime hook calls from pages
3. Delete `use-global-activity.ts` + gut `leaderboard/page.tsx`
4. Delete `use-leaderboard.ts` + gut `leaderboard/page.tsx`
5. Delete `use-narrative.ts` + gut `wire/page.tsx`, wire components
6. Delete `use-activity-feed.ts` + gut `page.tsx`
7. Delete `use-portfolio.ts` + gut `page.tsx`
8. Delete `use-desk.ts` + gut `page.tsx`
9. Delete `use-approvals.ts` + gut `page.tsx`, components
10. Delete `use-traders.ts` + gut traders pages, `page.tsx`
11. Delete `use-agent.ts` + gut trader detail page, components
12. Delete `use-create-trader.ts` + gut traders/new
13. Partial-delete `use-deals.ts`: keep `useSuggestPrompts` only; gut deal pages
14. Remove TanStack provider from `privy-provider.tsx`
15. Remove `@tanstack/react-query` from package.json
