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
- Bridge Privy auth into Convex via `auth.config.ts` so `ctx.auth.getUserIdentity()` works in queries/mutations.
- Keep x402-protected deal-entry routes in Next.js (they need raw HTTP 402 semantics from `x402-next` middleware); those routes call Convex for reads/writes.
- Remove TanStack Query entirely from client code; use Convex React hooks (`useQuery`, `useMutation`, `useAction`).
- Reset all game data on cutover — no backfill.

## User Stories

1. As a developer, I want all live UI surfaces (activity feed, deal approvals, leaderboard, narratives, trader detail) to update reactively from a single subscription primitive, so that I no longer maintain channel-plus-cache-invalidation pairings.
2. As a developer, I want the agent cycle to be a Convex cron + scheduler chain, so that I don't sign my own HTTP requests to fan out work.
3. As a developer, I want end-to-end TypeScript types generated from a single schema source of truth, so that schema drift is a compile error rather than a runtime surprise.
4. As a developer, I want Privy-authenticated users to be identifiable inside Convex functions via `ctx.auth`, so that authorization checks live next to the data they protect.
5. As a developer, I want x402 deal-entry to stay as a thin Next.js route, so that the Coinbase facilitator's HTTP 402 contract continues to work unchanged.
6. As a developer, I want CDP AgentKit operations (wallet creation, USDC transfers) to be callable from Convex actions, so that the agent loop runs end-to-end inside Convex.
7. As a developer, I want the deal-selection logic (mandate filter → desk dedup → LLM rank with ratio fallback) preserved as a pure module the cycle action calls, so that its tests are independent of the runtime.
8. As a developer, I want the GPT-5 mini outcome resolver preserved as a pure module, so that I can test prompt/response handling without booting the agent loop.
9. As a developer, I want the agent activity log writes to happen as a single Convex mutation called from cycle actions, so that activity events appear instantly in subscribed clients.
10. As a developer, I want SIWA login to mint a Privy session that Convex recognizes via `auth.config.ts`, so that the existing Farcaster sign-in flow works unchanged.
11. As a developer, I want the desk manager's approval threshold and approval consumption flow to be Convex mutations with optimistic updates, so that the UI feels instant without manual cache surgery.
12. As a desk manager, I want my dashboard to update the moment my agent enters a deal, so that I see live PnL without refresh.
13. As a desk manager, I want pending approval prompts to appear instantly when my agent flags a deal, so that I can approve/reject before the opportunity passes.
14. As a developer, I want narrative generation (`/api/narrative/generate`) to either move to a Convex action or stay as a Next.js route that writes to Convex, so that the choice is explicit rather than incidental.
15. As a developer, I want all `src/lib/supabase/*` modules removed and their callers ported to Convex query/mutation references, so that there is exactly one data layer.
16. As a developer, I want `pnpm db:types` and the entire `supabase/` migrations directory deleted, so that the repo no longer carries dead infrastructure.
17. As a developer, I want the agent-loop tests rewritten against the Convex test harness, so that the tests reflect production behavior.
18. As a developer, I want the cutover to wipe all game state cleanly, so that I don't carry inconsistent cross-system state into launch.
19. As a developer, I want `CLAUDE.md` updated to reflect Convex hooks as the new client data convention, so that future contributors don't reach for TanStack Query.
20. As a developer, I want a working `npx convex dev` parity run before deleting Supabase code, so that I can A/B compare behavior on a test trader.
21. As a developer, I want rate-limiting and Sentry instrumentation preserved across the migration, so that observability doesn't regress.

## Implementation Decisions

### Data layer

- **Convex schema** replaces all `supabase/migrations/*.sql`. Collections: `deskManagers`, `traders`, `deals`, `dealOutcomes`, `dealApprovals`, `agentActivityLog`, `traderTransactions`, `assets`, `marketNarratives`, `systemPrompts`, `siwaNonces`. Field types and indexes derived from current Postgres schema.
- **Authorization** moves from Postgres RLS to function-level checks inside Convex queries/mutations using `ctx.auth.getUserIdentity()`.
- **No data migration.** Pre-launch reset: drop Supabase project after cutover; Convex starts empty.

### Agent loop

- **`crons.ts`** runs every 30s and invokes an `internalAction` named `agent.scheduler`.
- **`agent.scheduler`** queries traders whose `lastCycleAt` is stale and calls `ctx.scheduler.runAfter(0, internal.agent.cycle, { traderId })` per trader. No HMAC, no self-signed HTTP.
- **`agent.cycle`** is an `internalAction` that mirrors the current `src/lib/agent/cycle.ts` flow: load trader + mandate → run deal selection → optionally request approval → enter deal (calls Next.js x402 route over HTTP from the action) → write outcome via mutation.
- **Deal-selection module** stays as a pure function in `src/lib/agent/deal-selection.ts` (or moves under `convex/lib/`); takes trader state + deal candidates + LLM client and returns a pick. Untouched by the migration except for its data-source adapter.
- **Outcome resolver** (GPT-5 mini call) stays pure; called from the cycle action.

### HTTP boundary (Next.js routes that survive)

- `POST /api/deal/enter` — x402-protected; remains a Next.js route. Internally calls a Convex mutation to record the deal once payment settles.
- SIWA routes (`/api/siwa/*`) — remain Next.js, write nonces to Convex.
- Webhook receivers (if any) — remain Next.js.
- All other routes under `src/app/api/{trader,desk,deal,activity,leaderboard,narrative,prompt,agent}` are deleted; their logic moves to Convex queries/mutations/actions.

### Auth bridge

- `convex/auth.config.ts` configured with Privy as the JWT issuer (issuer URL, JWKS).
- Client uses `ConvexProviderWithAuth` wrapping Privy's auth state.
- `ctx.auth.getUserIdentity().subject` keys all owner-scoped queries.

### Client data layer

- TanStack Query removed from `package.json`. `@tanstack/react-query` provider deleted.
- All `src/hooks/use-*.ts` rewritten to use `useQuery` / `useMutation` from `convex/react`.
- `src/hooks/use-realtime.ts` deleted (replaced by Convex's built-in reactivity).
- `CLAUDE.md` "Data Fetching" convention updated to point to Convex hooks.

### CDP integration

- CDP SDK calls (`@coinbase/cdp-sdk`) move into Convex actions. Actions can perform external network I/O and hold the CDP API key in Convex env vars.
- Wallet creation triggered by `traders.create` mutation calling an internal action.

### Observability

- Sentry stays in Next.js routes and Convex actions (Convex supports server-side error reporting via `@sentry/node` inside actions).
- Upstash rate-limit middleware moves to a wrapper utility callable from both Next.js routes and Convex mutations.

### Cutover

- Single hard cutover. Branch off main, land migration in one PR, deploy, drop Supabase project. No dual-write phase.

## Testing Decisions

**What makes a good test**: exercises external behavior — given a trader state, the cycle produces the expected sequence of mutations and external calls. No mocking of Convex internals; use the Convex test harness (`convex-test`) which runs queries/mutations against an in-memory backend.

**Modules to test**:

1. **Deal selection** (`deal-selection.ts`) — pure function. Tests cover mandate filter, desk dedup, LLM-rank happy path, ratio fallback. Prior art: existing tests in `src/lib/__tests__/`.
2. **Agent cycle action** — integration test that boots `convex-test`, seeds a trader + assets, runs the cycle action, asserts on resulting deal + activity-log rows. Prior art: `src/app/api/deal/enter/__tests__/route.test.ts` for the integration shape.
3. **Outcome resolver** — pure prompt-in / structured-output-out test against a mocked OpenAI client.
4. **Auth bridge** — smoke test that a query rejects unauthenticated callers and accepts a mocked Privy identity.

**What we drop**: every test that mocks `@supabase/supabase-js` or asserts on Postgres-shaped rows.

## Out of Scope

- Data migration / backfill from the existing Supabase project.
- Changes to x402 protocol integration, Privy login UX, CDP wallet semantics, or OpenAI prompts.
- Moving x402 deal-entry into a Convex HTTP action (deferred; revisit if x402-next gains Convex support).
- Schema changes beyond translating existing tables (no new features in this PRD).
- Migrating Sentry, Upstash, or other infra providers.
- Performance tuning of Convex queries (address post-cutover if needed).
- Updating CLAUDE.md beyond the data-fetching convention line.

## Further Notes

- **Risk: x402 inside Convex actions.** The cycle action calls the Next.js `/api/deal/enter` route over HTTP to settle the x402 payment. This is a deliberate boundary — if Convex actions can't make outbound HTTPS calls to our own deployment URL cleanly (or hit edge-runtime issues), the fallback is to keep the deal-entry decision in Next.js and have Convex only record the outcome.
- **Risk: Convex scheduler cadence.** The current loop runs every 30s. Convex crons support 1-minute minimum on the free tier; verify on the chosen plan or move the dispatch loop to a self-rescheduling action.
- **Risk: Privy JWT verification.** Privy's JWT issuer + JWKS endpoint must be reachable by Convex. Spike this on day 1; if blocked, fall back to verifying in Next.js and passing identity to Convex.
- **Verification plan**: run `npx convex dev` against a scratch deployment; replay the create-trader → fund → cycle → deal-enter → outcome flow on a single test trader; diff observed activity-log entries against an equivalent run on the current Supabase stack before deleting code.
- **Repo cleanup checklist (post-cutover)**: delete `supabase/`, `src/lib/supabase/`, `db:types` script, `@supabase/supabase-js` dep, `@tanstack/react-query` dep, `src/hooks/use-realtime.ts`, all deleted Next.js API routes.
