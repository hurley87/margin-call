# PRD: Migrate backend from Supabase to Convex

## Problem Statement

As a developer building Margin Call (a pre-launch PvP trading game), I'm hitting friction with the current Supabase + Vercel Cron + TanStack Query stack:

- **Realtime DX is brittle.** The dashboard relies on Supabase Realtime channels (activity feed, deal approvals, asset prices) coordinated with TanStack Query cache invalidation in `src/hooks/use-realtime.ts`. Race conditions and stale-cache bugs keep recurring, and the mental model (channel → invalidate → refetch) is heavier than the work it does.
- **The agent loop is over-wired.** Vercel Cron hits `POST /api/agent/scheduler`, which fans out HMAC-signed `POST /api/agent/cycle` calls per stale trader (`src/lib/agent/trigger-signed-cycle.ts`). Self-signing my own service to talk to itself is plumbing I shouldn't need.
- **Type flow is two-step.** `pnpm db:types` regenerates `src/lib/supabase/database.types.ts` against a remote project; types lag schema and PRs include large generated diffs.

I'm pre-launch with no real users, so the cost of switching is low and the cost of carrying this complexity to launch is high.

## Solution

Migrate the backend data + scheduling layer to Convex while keeping all on-chain, payment, and wallet integrations untouched. Concretely:

- Replace Supabase Postgres + Realtime with a Convex schema and reactive `useQuery` subscriptions.
- Replace Vercel Cron + the HMAC fan-out with a Convex `crons.ts` job that uses `ctx.scheduler.runAfter` to dispatch per-trader cycle actions.
- Bridge Privy auth into Convex via `auth.config.ts` so `ctx.auth.getUserIdentity()` works in queries/mutations; **Privy users resolve through Convex auth** for all owner-scoped access.
- Keep x402-protected deal-entry in **Next.js** for this migration: payment verification stays at the HTTP boundary; Convex stores the **verified** result only via a server-triggered Convex function (see [x402 to Convex boundary](#x402-to-convex-boundary)).
- Remove TanStack Query from **app-state flows**; core dashboard and game data use Convex hooks (`useQuery`, `useMutation`, `useAction`) directly—no TanStack Query for Convex-backed state.
- Reset all game data on cutover — no backfill.

### Architecture (final direction)

| Layer       | Owns                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| **Convex**  | Realtime game state, agent loop, internal scheduling, verified persistence of game events after boundaries run |
| **Next.js** | x402, payment verification, external HTTP boundaries (webhooks, SIWA HTTP handlers, etc.)                      |
| **Privy**   | Auth and wallets (sessions; embedded / connected wallets)                                                      |
| **UI**      | Convex React hooks only for Convex-backed state—no parallel TanStack cache invalidation for that data          |

### Definition of Done

The migration is **finished** only when all of the following are true:

1. **Supabase removed from app runtime** — no `src/lib/supabase/*` usage, no Supabase client in API routes or server components, no Postgres/RLS/Realtime in the live path.
2. **TanStack Query removed from app-state flows** — dashboard, trader, deal, activity, leaderboard, and narrative consumption do not use TanStack Query for fetching or cache coordination (Convex reactivity replaces it).
3. **Core data via Convex hooks** — desk/trader/deal/activity/leaderboard/narrative reads and writes for the game go through Convex queries, mutations, and actions as appropriate.
4. **Privy → Convex auth** — `ctx.auth` in Convex reflects the signed-in Privy user; owner-scoped data is never trusted from a raw client-supplied user id alone.
5. **Full game loop on Convex** — end-to-end from **trader creation** through **activity feed updates** (including approvals, deal lifecycle, and feed visibility) runs on Convex-backed state and scheduling.
6. **x402 deal entry** — still works through the **existing Next.js** x402 route; paid/verified entry is recorded in Convex only after server-side payment verification (see boundary section).
7. **Realtime UI without manual cache invalidation** — UI updates from Convex subscriptions; no channel + invalidate + refetch pairing for game state.
8. **Core agent-loop tests pass against Convex** — behavior-level tests (see [Testing Decisions](#testing-decisions)) green against the Convex test harness or equivalent.

### Idempotency requirements

All operations that can be **retried**, **duplicated**, or **triggered by external systems** MUST be idempotent (safe to run more than once without corrupting state or creating duplicate side effects). Design each with explicit idempotency keys, dedupe tables, or compare-and-set guards as appropriate.

| Area                             | Requirement (examples)                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Agent cycles**                 | Cycle runs keyed by `traderId` + monotonic generation or lease so overlapping cron ticks cannot double-enter the same deal step. |
| **Deal entries**                 | Idempotency key from payment / request id; reject or no-op duplicate “enter deal” for the same logical entry.                    |
| **Payment settlement recording** | Single writer path from verified HTTP boundary; duplicate callbacks no-op to the same stored settlement record.                  |
| **Wallet creation**              | At-most-one wallet per trader; pending → creating → ready transitions are exclusive.                                             |
| **Activity log writes**          | Append deduped by stable event id or (traderId, dealId, eventType, correlationId).                                               |
| **Outcome resolution**           | One resolved outcome per deal; retries do not re-apply PnL or narrative twice.                                                   |
| **Leaderboard updates**          | Derived or upserted from authoritative deal/trader state so replays cannot double-count.                                         |
| **Approval state changes**       | Transitions validate from-state; duplicate approve/reject no-ops.                                                                |

**Goal:** no duplicate deal entries, duplicate wallets, duplicate activity lines, repeated outcome resolution, or corrupted aggregates from retries and overlapping jobs.

### x402 to Convex boundary

For this migration, **x402 stays in Next.js**. Flow:

1. Client hits the existing Next.js x402-protected route (HTTP 402 semantics unchanged).
2. Next.js **verifies payment** at the HTTP boundary (current middleware / facilitator contract).
3. Only after verification, Next.js calls a **dedicated Convex server-side function** (e.g. internal mutation or HTTP-authenticated internal path) to **record** the paid deal entry and store the **verified** payment result.
4. The **client must never** directly mark a deal entry as paid, verified, or settled—no public mutation accepts those flags from untrusted input.

Convex stores the outcome of verification; **verification itself** remains in Next.js until a later phase explicitly moves it.

### Scheduled function auth

- **Scheduled agent jobs** (crons, `internalAction` cycle/scheduler) run **without** end-user auth context. They authorize as **internal system work**: load `trader`, owning `user`/desk, and config records from Convex and validate invariants there.
- **User-facing** queries and mutations **always** derive the caller from **Convex auth** (`ctx.auth` / Privy JWT), **not** from a user id or wallet address passed from the client as the source of truth.

## User Stories

1. As a developer, I want all live UI surfaces (activity feed, deal approvals, leaderboard, narratives, trader detail) to update reactively from a single subscription primitive, so that I no longer maintain channel-plus-cache-invalidation pairings.
2. As a developer, I want the agent cycle to be a Convex cron + scheduler chain, so that I don't sign my own HTTP requests to fan out work.
3. As a developer, I want end-to-end TypeScript types generated from a single schema source of truth, so that schema drift is a compile error rather than a runtime surprise.
4. As a developer, I want Privy-authenticated users to be identifiable inside Convex functions via `ctx.auth`, so that authorization checks live next to the data they protect.
5. As a developer, I want x402 deal-entry to stay as a thin Next.js route that **verifies payment before** invoking Convex to record the deal, so that the HTTP 402 contract stays correct and clients cannot forge paid state in Convex.
6. As a developer, I want CDP AgentKit operations (wallet creation, USDC transfers) to be callable from Convex actions, so that the agent loop runs end-to-end inside Convex.
7. As a developer, I want the deal-selection logic (mandate filter → desk dedup → LLM rank with ratio fallback) preserved as a pure module the cycle action calls, so that its tests are independent of the runtime.
8. As a developer, I want the GPT-5 mini outcome resolver preserved as a pure module, so that I can test prompt/response handling without booting the agent loop.
9. As a developer, I want the agent activity log writes to happen as a single Convex mutation called from cycle actions, so that activity events appear instantly in subscribed clients.
10. As a developer, I want SIWA login to mint a Privy session that Convex recognizes via `auth.config.ts`, so that the existing Farcaster sign-in flow works unchanged.
11. As a developer, I want the desk manager's approval threshold and approval consumption flow to be Convex mutations with optimistic updates, so that the UI feels instant without manual cache surgery.
12. As a desk manager, I want my dashboard to update the moment my agent enters a deal, so that I see live PnL without refresh.
13. As a desk manager, I want pending approval prompts to appear instantly when my agent flags a deal, so that I can approve/reject before the opportunity passes.
14. As a developer, I want **narrative generation in a Convex action** by default: load game state, call the LLM, write the result to Convex, and expose the final narrative through normal Convex queries—unless **browser streaming** is required, in which case a thin streaming route may remain; otherwise **remove** the old `/api/narrative/generate` route.
15. As a developer, I want all `src/lib/supabase/*` modules removed from the **runtime** and their callers ported to Convex, so that there is exactly one live data layer.
16. As a developer, I want Supabase **removed from the app** (`pnpm db:types`, client imports, CI assumptions) while the **hosted Supabase project is archived** (not deleted) for a parity window (see [Cutover](#cutover)), so that we can reference schema/data if needed before permanent teardown.
17. As a developer, I want **behavior-level** agent-loop and game-flow tests on the Convex test harness (not one-to-one ports of Supabase mocks), so that tests reflect production semantics including idempotency and auth.
18. As a developer, I want the cutover to wipe all game state cleanly, so that I don't carry inconsistent cross-system state into launch.
19. As a developer, I want `CLAUDE.md` updated to reflect Convex hooks as the new client data convention, so that future contributors don't reach for TanStack Query.
20. As a developer, I want a working `npx convex dev` parity run before deleting Supabase code, so that I can A/B compare behavior on a test trader.
21. As a developer, I want rate-limiting and Sentry instrumentation preserved across the migration, so that observability doesn't regress.

## Implementation Decisions

### Data layer

- **Convex schema** replaces all `supabase/migrations/*.sql`. Collections: `deskManagers`, `traders`, `deals`, `dealOutcomes`, `dealApprovals`, `agentActivityLog`, `traderTransactions`, `assets`, `marketNarratives`, `systemPrompts`, `siwaNonces`. Field types and indexes derived from current Postgres schema.
- **Authorization** moves from Postgres RLS to function-level checks inside Convex queries/mutations using `ctx.auth.getUserIdentity()` for user-facing functions; scheduled/internal functions use loaded records + internal checks (see [Scheduled function auth](#scheduled-function-auth)).
- **No data migration.** Pre-launch reset: Convex starts empty. **Do not immediately delete** the hosted Supabase project at cutover—**archive** it for **7–14 days** as a reference; delete the hosted project only after Convex parity is verified (see [Cutover](#cutover)).

### Agent loop

- **`crons.ts`** runs every 30s and invokes an `internalAction` named `agent.scheduler`.
- **`agent.scheduler`** queries traders whose `lastCycleAt` is stale and calls `ctx.scheduler.runAfter(0, internal.agent.cycle, { traderId })` per trader. No HMAC, no self-signed HTTP.
- **`agent.cycle`** is an `internalAction` that mirrors the current `src/lib/agent/cycle.ts` flow: load trader + mandate → run deal selection → optionally request approval → enter deal (calls Next.js x402 route over HTTP from the action) → write outcome via mutation. **Every step that can retry MUST be idempotent** (see [Idempotency requirements](#idempotency-requirements)).
- **Deal-selection module** stays as a pure function in `src/lib/agent/deal-selection.ts` (or moves under `convex/lib/`); takes trader state + deal candidates + LLM client and returns a pick. Untouched by the migration except for its data-source adapter.
- **Outcome resolver** (GPT-5 mini call) stays pure; called from the cycle action.

### HTTP boundary (Next.js routes that survive)

- `POST /api/deal/enter` — x402-protected; remains a Next.js route. **Verify payment first** at the HTTP boundary, then call a **dedicated Convex server-side function** to record the verified paid deal entry (idempotent on settlement id / request key). The client cannot mark deals paid or settled directly in Convex.
- SIWA routes (`/api/siwa/*`) — remain Next.js, write nonces to Convex.
- Webhook receivers (if any) — remain Next.js.
- All other routes under `src/app/api/{trader,desk,deal,activity,leaderboard,narrative,prompt,agent}` are deleted; their logic moves to Convex queries/mutations/actions.

### Auth bridge

- `convex/auth.config.ts` configured with Privy as the JWT issuer (issuer URL, JWKS).
- Client uses `ConvexProviderWithAuth` wrapping Privy's auth state.
- `ctx.auth.getUserIdentity().subject` keys all owner-scoped queries and mutations. **Authorization never uses a client-supplied user id as the trust root**—only `ctx.auth` (plus internal functions for system jobs).

### Client data layer

- TanStack Query removed from **app-state and game/dashboard code paths**; remove `@tanstack/react-query` and the app-wide `QueryClientProvider` once no hook still depends on them. Convex-backed UI uses **`useQuery` / `useMutation` / `useAction` from `convex/react` only**—no parallel TanStack cache for that state.
- All game-related `src/hooks/use-*.ts` rewritten to Convex hooks or thin wrappers over them.
- `src/hooks/use-realtime.ts` deleted (replaced by Convex's built-in reactivity).
- `CLAUDE.md` "Data Fetching" convention updated to point to Convex hooks (and to forbid TanStack for Convex-backed state).

### CDP integration (wallet creation — no side effects in mutations)

External wallet work **must not** run inside a **deterministic Convex mutation**.

**Flow:**

1. **`traders.create` mutation** (or equivalent) creates the trader in Convex with **`pending` wallet state** (or equivalent status flag).
2. Mutation **schedules an internal wallet-creation job** (e.g. `ctx.scheduler.runAfter(0, internal.wallet.createForTrader, { traderId })`).
3. **`internal.wallet.createForTrader` action** runs CDP / AgentKit calls (`@coinbase/cdp-sdk`), performs network I/O, holds CDP API keys in Convex env vars.
4. Action completes by calling an **internal mutation** that updates the trader record (`pending` → `ready` / error) with wallet metadata—**single idempotent transition** per trader.

This keeps external side effects in **actions** and state transitions in **mutations**.

### Observability

- Sentry stays in Next.js routes and Convex actions (Convex supports server-side error reporting via `@sentry/node` inside actions).
- Upstash rate-limit middleware moves to a wrapper utility callable from both Next.js routes and Convex mutations.

### Cutover

- Single hard cutover for **runtime**: branch off main, land migration, deploy Convex-backed app with **Supabase removed from code paths**. No dual-write phase.
- **Hosted Supabase project:** pause/archive (not delete) for **7–14 days** after cutover for schema/reference and emergency diffing; **delete the hosted project only** after Convex parity is verified against [Definition of Done](#definition-of-done).
- Repo may remove `supabase/` migrations from active use once nothing imports them; align with team preference for keeping a git tag or branch pointing at pre-cutover for history.

## Testing Decisions

**Do not port** old Supabase-era tests **one-to-one**. Prefer **behavior-level** coverage that matches production semantics on Convex.

**What makes a good test**: asserts **observable outcomes**—given seed state in Convex, running queries/mutations/actions produces the correct documents, transitions, and call patterns—without coupling to Supabase shapes, TanStack Query cache keys, or Realtime subscription plumbing.

**Use** the Convex test harness (`convex-test`) or equivalent so queries/mutations run against an in-memory Convex backend where appropriate.

**Behavior areas to cover** (non-exhaustive):

| Area                         | Intent                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Trader cycle**             | Stale trader → scheduler/cycle → expected writes; overlapping runs do not double-apply.                                        |
| **Deal discovery**           | Candidates and filters reflected in state or next cycle inputs.                                                                |
| **Deal entry**               | Verified entry recorded once; duplicates no-op or reject cleanly.                                                              |
| **Duplicate prevention**     | Idempotency for entries, wallets, activity lines, outcomes (align with [Idempotency requirements](#idempotency-requirements)). |
| **Outcome resolution**       | Single outcome application; retries do not double PnL or logs.                                                                 |
| **Activity feed**            | Events appear as expected after cycle/approval/deal steps.                                                                     |
| **Leaderboard**              | Updates consistent with underlying deal/trader state after events.                                                             |
| **Failed external calls**    | CDP/LLM/OpenAI/x402 partner failures leave trader/deal in valid partial states and allow safe retry.                           |
| **x402-verified entries**    | Path that simulates “Next.js verified → Convex record” rejects unverified or client-forged settlement.                         |
| **Auth-protected mutations** | Unauthenticated or wrong-subject callers cannot mutate owner data; internal jobs use internal auth path only.                  |

**Keep** pure-module tests where they add signal (e.g. **deal-selection** mandate filter, desk dedup, LLM rank, ratio fallback; **outcome resolver** structured output against a mocked OpenAI client)—these are runtime-agnostic.

**Remove** tests that exist only to verify:

- Supabase client mocks or SQL/Postgres row shapes
- TanStack Query cache invalidation or fetch orchestration
- Old Realtime subscription wiring

**Auth bridge**: smoke tests that Convex queries/mutations reject missing `ctx.auth` for user-owned resources and accept a **mocked Privy JWT identity** where the harness supports it.

## Out of Scope

- Data migration / backfill from the existing Supabase project.
- Changes to x402 protocol integration, Privy login UX, CDP wallet semantics, or OpenAI prompts.
- Moving x402 deal-entry or **payment verification** into Convex (deferred; Convex only records verified results from Next.js for this migration).
- A dedicated Next.js **streaming** narrative endpoint is in scope **only if** product requires streaming UX; otherwise narrative is Convex-action-only (see user story 14).
- Schema changes beyond translating existing tables (no new features in this PRD).
- Migrating Sentry, Upstash, or other infra providers.
- Performance tuning of Convex queries (address post-cutover if needed).
- Updating CLAUDE.md beyond the data-fetching convention line.

## Further Notes

- **Risk: x402 inside Convex actions.** The cycle action calls the Next.js `/api/deal/enter` route over HTTP to settle the x402 payment. This is a deliberate boundary — if Convex actions can't make outbound HTTPS calls to our own deployment URL cleanly (or hit edge-runtime issues), the fallback is to keep the deal-entry decision in Next.js and have Convex only record the outcome.
- **Risk: Convex scheduler cadence.** The current loop runs every 30s. Convex crons support 1-minute minimum on the free tier; verify on the chosen plan or move the dispatch loop to a self-rescheduling action.
- **Risk: Privy JWT verification.** Privy's JWT issuer + JWKS endpoint must be reachable by Convex. Spike this on day 1; if blocked, fall back to verifying in Next.js and passing identity to Convex.
- **Verification plan**: run `npx convex dev` against a scratch deployment; replay the create-trader → fund → cycle → deal-enter → outcome flow on a single test trader; diff observed activity-log entries against an equivalent run on the current Supabase stack before deleting code.
- **Repo cleanup checklist (post-cutover)**: remove `src/lib/supabase/` and all runtime Supabase usage; remove `@supabase/supabase-js` from the live app; remove `@tanstack/react-query` and app-state hooks that only existed for Supabase + invalidation; delete `src/hooks/use-realtime.ts`; remove superseded Next.js API routes (including narrative route if moved to Convex); remove or gate `pnpm db:types` and stop treating `supabase/migrations` as source of truth for the running app. **Defer hosted Supabase project deletion** until the archive window closes and parity is confirmed—not immediate with first deploy.
