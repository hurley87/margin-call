# Trading-Hours Enforcement Spec

Status: draft
Owner: davidhurley@lazertechnologies.com
Last updated: 2026-05-14

## 1. Goal

Prevent new market activity (deal creation, agent deal entry, autonomous trader cycles) outside US equities trading hours, while leaving all historical data, configuration flows, and recovery paths untouched.

Trading hours: **Monday–Friday, 09:30:00–16:00:00 America/New_York** (open inclusive, close exclusive). Holidays and half-days are explicitly out of scope for v1.

## 2. Scope

In scope:

- New deal creation (`convex/deals.ts::recordOnChainCreation`).
- Deal entry transport (`src/app/api/deal/enter/route.ts::handleAgentCycleDealEnter`).
- Defensive guard on `convex/deals.ts::recordVerifiedEntry`.
- Autonomous agent cycle (`convex/agent/cycle.ts`).
- Trader activation (`convex/traders.ts::setStatus` when transitioning to `"active"`).
- UI gating for create-deal and activate-trader affordances.
- Migration of the existing `isMarketOpen` helper in `convex/wire/tradingHours.ts` to the new shared utility.
- Migration of the duplicate market-countdown logic in `src/app/page.tsx`.

Out of scope:

- US holidays / half-days. v1 ships Mon–Fri only; the utility is shaped so holiday data can be added later without changing call sites.
- Funding traders / depositing to escrow.
- Trader profile creation, wallet creation, portrait generation, mandate editing.
- Pausing or revoking traders.
- Outcome resolution for already-paid entries (must always be permitted to avoid stranded escrow — see §5.4).
- Approval create / approve / reject actions (always permitted; see §5.5).

## 3. Architecture

### 3.1 Shared utility location

Canonical file: **`convex/lib/tradingHours.ts`**.

Rationale: `convex/tsconfig.json` only includes `./**/*.ts`, and Convex cannot import from `src/`. The reverse is well-established: `src/` already imports from `../../convex/_generated`. Putting the canonical util under `convex/lib/` gives both runtimes one source of truth via relative imports, with no build-config changes and no mirrored files to keep in sync.

Existing `convex/wire/tradingHours.ts` will keep its wire-specific helpers (`currentEpochSlot`, `isOpeningBell`, `dayPosture`) but its `isMarketOpen` will be rewritten to delegate to `convex/lib/tradingHours.ts` so the wire generator path remains import-stable.

The duplicate market-countdown logic in `src/app/page.tsx` (`MARKET_OPEN_SEC`, `MARKET_CLOSE_SEC`, `DAYS_UNTIL_NEXT_OPEN`, `getMarketCountdown`) is replaced by a call to `getTradingHoursState`.

### 3.2 Public API

```ts
// convex/lib/tradingHours.ts

export const TRADING_TIMEZONE = "America/New_York" as const;
export const TRADING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 09:30
export const MARKET_CLOSE_MINUTES = 16 * 60; // 16:00

/** Standardised user-facing copy. */
export const MARKET_CLOSED_MESSAGE =
  "Market is closed. Trading hours are 9:30 AM–4:00 PM ET, Monday–Friday.";

/** Compose a call-site-specific suffix, e.g. "(cannot activate trader)". */
export function marketClosedMessage(reasonSuffix?: string): string;

/** Pure boolean check. */
export function isTradingHours(now?: number): boolean;

/** Rich status object used by UI + error responses. */
export function getTradingHoursState(now?: number): {
  isOpen: boolean;
  reason?: "weekend" | "before_open" | "after_close";
  nextOpenAt?: number; // epoch ms, undefined if isOpen
  nextCloseAt?: number; // epoch ms, undefined if !isOpen
  timezone: "America/New_York";
};

/** Throws a normal Error with marketClosedMessage(reasonSuffix). */
export function assertTradingHours(now?: number, reasonSuffix?: string): void;

/** Close-edge grace window for already-on-chain settlements (see §5.1). */
export function isTradingHoursWithCloseGrace(
  now?: number,
  graceMs?: number // default 60_000
): boolean;
```

Implementation notes:

- All time math uses `Intl.DateTimeFormat` with `timeZone: "America/New_York"` (same pattern as the existing `convex/wire/tradingHours.ts`). No `Date.getHours()`, no hardcoded UTC offsets — DST is handled correctly by the formatter.
- No new date library. `Intl` is sufficient.
- The `now?: number` parameter is required on every exported function so tests can inject time without `vi.useFakeTimers()`.

### 3.3 Dev override (`MC_FORCE_MARKET_OPEN`)

When `process.env.MC_FORCE_MARKET_OPEN === "1"`, `isTradingHours()` and `assertTradingHours()` behave as if the market is open. The override is **server-only and ignored when `NODE_ENV === "production"`**:

```ts
function forceOpenEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.MC_FORCE_MARKET_OPEN === "1";
}
```

The override is _not_ exposed to the client (no `NEXT_PUBLIC_*` mirror). UI may briefly show "closed" while server allows actions — that's acceptable for dev.

## 4. Enforcement points

| Call site                                                              | Behavior outside hours                                                   | Mechanism                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `convex/deals.ts::recordOnChainCreation`                               | Reject, but with +60s grace past close                                   | `assertTradingHoursWithCloseGrace()`                |
| `src/app/api/deal/enter/route.ts::handleAgentCycleDealEnter`           | HTTP 423 + `Retry-After` header                                          | Inline check, `getTradingHoursState()`              |
| `convex/deals.ts::recordVerifiedEntry` (internal, defensive)           | Accept within +60s grace past close; reject otherwise                    | `isTradingHoursWithCloseGrace()`                    |
| `convex/agent/cycle.ts::cycle`                                         | See §5.3 (cheap pre-lease recovery probe → either resume or silent skip) | `isTradingHours()` + `hasPendingRecoveryWork` query |
| `convex/traders.ts::setStatus` (only when transitioning to `"active"`) | Throw with `marketClosedMessage("(cannot activate trader)")`             | `assertTradingHours()`                              |

Activation pause/wipe-out transitions are **not** gated. Creating a trader stays paused → not gated either.

## 5. Behavioural rules

### 5.1 Close-edge grace (`recordOnChainCreation`, `recordVerifiedEntry`)

On-chain transactions and Convex writes are not atomic. An x402 settlement that lands at 15:59:58 ET may surface to Convex at 16:00:03 ET; the user has already paid on-chain. A hard 16:00 cutoff would strand funds.

Rule: `recordVerifiedEntry` and `recordOnChainCreation` apply a **+60s close grace**. The window is purposely small — large enough for normal RPC + Convex round-trip jitter, tight enough to not be abused.

Pre-open: **no grace.** Both writes reject hard before 09:30:00 ET. There is no equivalent "race" before open; nothing should be calling these paths.

### 5.2 Agent cycle structure

```
cycle(traderId):
  1. Load trader. If not eligible (status/wallet/balance), return.
  2. Compute marketOpen = isTradingHours(now).
  3. If !marketOpen:
        hasRecovery = await runQuery(internal.agent.internal.hasPendingRecoveryWork, { traderId })
        if !hasRecovery:
          await runMutation(internal.agent.internal.stampLastCycleAt, { traderId, lastCycleAt: now })
          return  // silent exit, no log, no lease, scheduler stays healthy
        // else: fall through; recovery is always permitted
  4. Acquire lease (CAS).
  5. If first cycle of trading day for this trader (lastCycleAt < today's openMs and marketOpen):
        append agentActivityLog: { activityType: "market_open", message: "Cycle resumed at market open" }
  6. Select / approval-gate / enter / resolve as today, with the caveats:
        - selectDeal + entry are wrapped under `if (marketOpen)`.
        - resolveOutcome path runs unconditionally — recovery is always allowed.
  7. markCycleComplete.
```

`hasPendingRecoveryWork(traderId)`:

- New `internalQuery` in `convex/agent/internal.ts`.
- Scans `dealEntries.byTrader` index where `createdAt > now - 24h` AND no corresponding row in `dealOutcomes` for `(traderId, dealId)`.
- 24h scope is deliberately bounded — anything older is an ops/manual problem and shouldn't keep the cycle waking.
- Returns `boolean`.

`stampLastCycleAt(traderId, lastCycleAt)`:

- New `internalMutation`. Plain `ctx.db.patch(traderId, { lastCycleAt })`. No lease, no generation bump. Purely to keep `listStaleTradersForCycle`'s interval gate accurate so the scheduler doesn't re-enqueue every minute overnight.

### 5.3 Outcome resolution after-hours

Always permitted. The trading-hours check happens _before_ selection / entry, never around `resolveOutcome` / `dealOutcomes.apply` / `traders.applyOutcomeBalance` / on-chain `resolveEntry`. A crashed cycle that recovers at 02:00 ET must be able to finish a paid-but-unresolved entry, or the user's funds are stuck in escrow.

### 5.4 Approvals

`dealApprovals.request`, approve, and reject are **not** gated. A desk manager can pre-approve a deal at 22:00 ET; the cycle will consume it at the next 09:30 open if still within `APPROVAL_EXPIRY_MS`.

The pending-approval consumption happens inside the cycle's normal "approval gate" step (§5.2 step 6), which only runs when market is open.

### 5.5 Activation UX

`setStatus({ status: "active" })` outside hours throws `Error(marketClosedMessage("(cannot activate trader)"))`. No queueing, no pending-activation flag. The UI shows the activate-trader button disabled with the inline countdown (§6). Users must return at 09:30 to activate.

Already-active traders stay active in state. They produce no work outside hours because the cycle short-circuits in §5.2 step 3.

### 5.6 Scheduler load at open

No staggering. The 1-minute Convex cron heartbeat already absorbs up to ~60s of natural jitter, and trader cycles trigger on per-trader intervals (`resolveCycleIntervalMsForTrader`) rather than all at once. Ship as-is. Revisit only if observed.

## 6. UI

### 6.1 Components affected

1. **`TopStatusBar` in `src/app/page.tsx`** — replace local `getMarketCountdown` with `getTradingHoursState(nowMs)`. Drive HH:MM:SS countdown from `nextOpenAt`/`nextCloseAt`. Visual treatment unchanged.

2. **`<CreateDealDialog />` trigger** in `src/components/wire/create-deal-dialog.tsx` (and any sibling create-deal buttons) — when market is closed, the trigger button renders as disabled with inline label `MARKET CLOSED — Opens in HH:MM:SS`.

3. **Activate-trader button** in `src/components/trader-detail.tsx` and trader-creation flow — same disabled-with-inline-countdown pattern when status would be `"active"`.

### 6.2 Time source

Client-clock + `useSecondTick` (existing hook). No new Convex query for market status. Drift is sub-second in practice; server is the enforcement boundary.

For action-submit moments (clicking create-deal, activate), the server's 423/Error response is the final authority. UI gating is guidance only.

### 6.3 Toast policy

No toasts for market-closed states. Inline disabled-with-countdown is the entire UI affordance. If a 423 ever surfaces from a race, fall through to whatever the existing error toast pipeline does.

### 6.4 Suggested shared component

`src/components/market-closed-button.tsx`:

```tsx
<MarketClosedButton
  isClosed={!isOpen}
  countdownLabel={hms}
  closedLabel="MARKET CLOSED"
  enabledChildren={<>Create Deal</>}
/>
```

Used by both the create-deal trigger and activate-trader button to keep copy + visual treatment consistent.

## 7. Error responses

### 7.1 Convex mutations

`throw new Error(marketClosedMessage(reasonSuffix))`. Plain Error matches the existing repo idiom. No structured `.data` payload.

### 7.2 HTTP route (`/api/deal/enter`)

- Status: **423 Locked**.
- Headers: `Retry-After: <seconds until nextOpenAt>`.
- Body: `{ error: "market_closed", message: <marketClosedMessage()>, next_open_at: <iso8601> }`.

### 7.3 Agent cycle's `callDealEnter`

Add a new branch alongside the existing 409 handling: on HTTP 423, log a one-line `console.log("[cycle] /api/deal/enter rejected — market closed")`, do not append to activity log, exit the cycle cleanly. Treat as non-retryable for this cycle invocation; the next scheduled heartbeat at/after 09:30 will retry naturally.

## 8. Activity log

Single new event type: `"market_open"`.

- Emitted once per trader per trading day, by the cycle, when `lastCycleAt < today's 09:30 ET in epoch ms` and the current call is within trading hours.
- Message: `"Cycle resumed at market open"`.
- No `"market_closed"` events. No per-skip events.

`agentActivityLog.append` already dedupes via `dedupeKey`; use `dedupeKey = ${traderId}-market_open-${todayDateNY}` to be safe against double-fire from concurrent recovery + lease retries.

## 9. Tests

### 9.1 Unit tests for the utility (`tests/convex/trading-hours.test.ts`)

Required cases:

- Monday 09:29:59 ET → closed.
- Monday 09:30:00 ET → open.
- Monday 15:59:59 ET → open.
- Monday 16:00:00 ET → closed.
- Friday 12:00 ET → open.
- Saturday noon ET → closed.
- Sunday noon ET → closed.
- DST-safe: Monday 10:00 ET on **2026-03-09** (day after spring forward) → open.
- DST-safe: Monday 10:00 ET on **2026-11-02** (day after fall back) → open.
- `getTradingHoursState` correctly computes `nextOpenAt` across weekends (Friday 17:00 → Monday 09:30 = 64.5 hours).
- `isTradingHoursWithCloseGrace`: 16:00:30 with default 60s grace → true; 16:01:30 → false.
- `MC_FORCE_MARKET_OPEN=1` in `NODE_ENV=development` → always returns true regardless of timestamp.
- `MC_FORCE_MARKET_OPEN=1` in `NODE_ENV=production` → ignored, normal rules apply.

All timestamps injected via the `now?: number` parameter — no real-clock dependencies.

### 9.2 Convex mutation tests (`tests/convex/trading-hours-enforcement.test.ts`, using `convex-test`)

- `recordOnChainCreation` on Tuesday 10:00 ET → succeeds; on Saturday 12:00 ET → throws with `MARKET_CLOSED_MESSAGE`.
- `recordOnChainCreation` at 16:00:30 ET → succeeds (grace); at 16:01:30 ET → throws.
- `recordVerifiedEntry` at 16:00:30 ET → succeeds; at 16:01:30 ET → throws.
- `setStatus({status:"active"})` outside hours → throws; `setStatus({status:"paused"})` outside hours → succeeds.
- `setStatus({status:"active"})` for a trader whose `walletStatus != "ready"` → still throws the existing wallet-ready error _first_, before the trading-hours check, to keep precedence intuitive.

Time injection: tests pass `now` directly into the helper, OR set `MC_FORCE_MARKET_OPEN=1` for the convex-test environment when they need open state regardless of wall clock. Convex mutations can't easily receive a `now` arg without polluting public signatures, so the env-toggle is the right tool here.

### 9.3 Route test (`src/app/api/deal/enter/__tests__/route.test.ts`)

- Wall-clock outside hours + valid SIWA → 423 + `Retry-After` + body discriminant.
- Wall-clock inside hours → normal 200 path (mock downstream).
- Uses `vi.setSystemTime()` since route handlers read `Date.now()` internally.

### 9.4 Agent cycle test (`tests/convex/agent-cycle-trading-hours.test.ts`)

- Cycle at Saturday noon, no pending recovery → returns silently, no lease acquired, `lastCycleAt` stamped, no `agentActivityLog` row.
- Cycle at Saturday noon, with a stale dealEntry < 24h old missing dealOutcomes → proceeds (recovery), runs `resolveOutcome` path, does NOT call `selectDeal`.
- Cycle at Monday 09:30 with last cycle < today's open → appends one `market_open` activity row with the correct `dedupeKey`.
- Concurrent cycle calls under same `market_open` window → only one activity row written (dedupe enforced).

## 10. Acceptance criteria (restated)

- [ ] Users can browse the app outside trading hours.
- [ ] Users cannot create deals outside trading hours (server-enforced).
- [ ] Agents cannot enter new deals outside trading hours (server-enforced).
- [ ] Autonomous trader cycles do not select or enter new deals outside trading hours.
- [ ] Outcome resolution for already-paid entries works at any time (no escrow stranding).
- [ ] Trader profiles can still be created/configured while the market is closed.
- [ ] Activating a trader is blocked outside trading hours.
- [ ] Existing active traders remain `status="active"`; cycles short-circuit silently.
- [ ] Cycle does not re-enqueue every minute overnight (`lastCycleAt` stamped on silent skip).
- [ ] `pnpm test` passes.
- [ ] `pnpm lint` passes.

## 11. Implementation order (suggested)

1. `convex/lib/tradingHours.ts` + unit tests.
2. Migrate `convex/wire/tradingHours.ts::isMarketOpen` to delegate.
3. Migrate `src/app/page.tsx` countdown.
4. Add `MarketClosedButton` shared component.
5. Add guards to `recordOnChainCreation`, `recordVerifiedEntry`, `/api/deal/enter`, `setStatus` (each with its targeted test).
6. Add `hasPendingRecoveryWork` + `stampLastCycleAt` internal functions.
7. Rewire `convex/agent/cycle.ts` per §5.2.
8. Wire `MarketClosedButton` into create-deal + activate-trader UIs.
9. Full integration sweep + acceptance check.

## 12. Open questions / future work

- Holidays + half-days. Plan: extend `getTradingHoursState` with an optional `holidays: Date[]` config; logic centralised, call sites unchanged.
- If thundering-herd at 09:30 ever becomes real, port the wire generator's opening-bell pattern to cycles (§5.6).
- If users start losing money to stranded on-chain creates that race past the 60s close grace, widen the grace or add a reconciliation activity log entry on rejection.
