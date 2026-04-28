# Supabase Archive Runbook

**Owner:** David Hurley (davidhurley@lazertechnologies.com)
**Archive start date:** 2026-04-26
**Deletion eligible after:** 2026-05-10 (7–14 days after cutover)
**Project ID:** `onnxgjahctckjuoqwdxt`
**Project name:** margin-call (Supabase)

---

## Context

The Convex migration (#81–#91) removed Supabase from the runtime. The hosted
Supabase project must be **paused, not deleted** during the parity window so
schema and data are available for emergency diffing or reference. Delete the
hosted project only after all items in the [Parity Verification Checklist](#parity-verification-checklist)
are confirmed.

---

## Parity Verification Checklist

Tie each item to PRD Definition of Done §1–§8 before authorising deletion.

| #   | Definition of Done item                                                                                                                                             | Verified?            | Notes                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| §1  | Supabase removed from app runtime — no `src/lib/supabase/*` usage, no Supabase client in API routes or server components, no Postgres/RLS/Realtime in the live path | ✅ Done in #91       | All imports deleted; `@supabase/supabase-js` removed from package.json                                                                     |
| §2  | TanStack Query removed from app-state flows — dashboard/trader/deal/activity/leaderboard/narrative do not use TanStack Query for Convex-backed state                | Partial              | Convex hooks exist (`use-convex-*.ts`); legacy TanStack hooks still present for non-critical paths; full hook migration tracked separately |
| §3  | Core data via Convex hooks — desk/trader/deal/activity/leaderboard reads and writes go through Convex queries, mutations, and actions                               | Partial              | Convex schema and CRUD in place; UI pages still migrating to `useConvexTraders` etc.                                                       |
| §4  | Privy → Convex auth — `ctx.auth` reflects signed-in Privy user; owner-scoped data never trusted from raw client-supplied id                                         | ✅ Done in #81       | `convex/auth.config.ts` wired; mutations use `ctx.auth.getUserIdentity()`                                                                  |
| §5  | Full game loop on Convex — end-to-end from trader creation through activity feed updates runs on Convex                                                             | ✅ Done in #85–#87   | Convex cron → scheduler → cycle action → `/api/deal/enter` → `recordVerifiedEntry`                                                         |
| §6  | x402 deal entry still works through Next.js route; verified entry recorded in Convex after server-side payment verification                                         | ✅ Done in #87 + #91 | `deal/enter` reads/writes Convex only; no Supabase calls remain                                                                            |
| §7  | Realtime UI without manual cache invalidation — UI updates from Convex subscriptions                                                                                | Partial              | `use-realtime.ts` stubbed out; Convex queries are reactive; UI migration ongoing                                                           |
| §8  | Core agent-loop tests pass against Convex                                                                                                                           | ✅ Done in #90       | `convex/__tests__/` green                                                                                                                  |

**Deletion gate:** All 8 items must be ✅ before running the deletion steps below.

---

## Step-by-Step: Pause the Hosted Supabase Project

**DO NOT delete the project until parity is confirmed. Pause only.**

1. Sign in to [supabase.com](https://supabase.com) as the project owner.
2. Navigate to **Project Settings → General**.
3. Scroll to **Danger Zone**.
4. Click **Pause project** (not "Delete project").
5. Confirm the pause. The project enters a paused state — schema and data are
   preserved but the database is offline.
6. Record the pause date in this file.

**Paused on:** _(fill in when done)_

---

## Step-by-Step: Delete the Hosted Supabase Project

**Only run this after the parity window closes and all checklist items are ✅.**

1. Ensure you have exported a final schema dump:
   ```bash
   # From a machine with Supabase CLI and project access
   supabase db dump --project-ref onnxgjahctckjuoqwdxt -f docs/legacy/supabase-schema-final.sql
   ```
2. Optionally export data for archival:
   ```bash
   supabase db dump --project-ref onnxgjahctckjuoqwdxt --data-only -f docs/legacy/supabase-data-final.sql
   ```
3. Sign in to [supabase.com](https://supabase.com).
4. Navigate to **Project Settings → General → Danger Zone**.
5. Click **Delete project**.
6. Type the project name to confirm.
7. Remove any remaining Supabase environment variables from Vercel / production
   secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`).

**Deleted on:** _(fill in when done)_

---

## Optional: Git Tag for Pre-Cutover Reference

To mark the last commit before the Convex cutover merged into `main`, create
a tag pointing at the last `main` commit before this migration PRs were merged:

```bash
git tag pre-convex-cutover 4593ded
git push origin pre-convex-cutover
```

`4593ded` is the last commit on `main` before the #81–#91 migration series
(`docs: tighten Convex migration PRD`).

This tag lets you diff the old Supabase-backed code against the new Convex
stack at any time:

```bash
git diff pre-convex-cutover..main -- src/
```

---

## Emergency Reference

If you need to compare Convex schema against the old Supabase schema during
the parity window:

- Old migrations: `supabase/migrations/` (still in git history — never deleted)
- Convex schema: `convex/schema.ts` (single source of truth going forward)
- Diff collections against tables:
  - `deskManagers` ↔ `desk_managers`
  - `traders` ↔ `traders`
  - `deals` ↔ `deals`
  - `dealEntries` (new — x402 verified entries, no Supabase equivalent)
  - `dealOutcomes` ↔ `deal_outcomes`
  - `dealApprovals` ↔ `deal_approvals`
  - `agentActivityLog` ↔ `agent_activity_log`
  - `assets` ↔ `assets`
  - `marketNarratives` ↔ `market_narratives`
  - `systemPrompts` ↔ `system_prompts`
  - `siwaNonces` ↔ `siwa_nonces`
  - `traderTransactions` ↔ `trader_transactions` (not yet in Convex schema — tracked separately)
  - `leaderboard` ↔ derived from traders + dealOutcomes (no separate table)
