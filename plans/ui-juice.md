# UI Juice — Living Trading Floor

> **Note:** Step 0 of implementation is to save this plan to `plans/ui-juice.md` in the repo (the user's requested location; plan mode restricted writes to this file).

## Context

The game's data layer is fully reactive (Convex subscriptions) but the presentation layer swaps values silently — balances change with no transition, feed rows pop in with no arrival cue, the leaderboard reorders invisibly, and wipeouts (the most dramatic event in the game) get only a small toast. Goal: make the UI feel like a living trading floor — tense, kinetic, satisfying.

**Visual direction (user-confirmed in interview):** clean modern base, 1980s Wall Street as seasoning. Specifically:

- **Dial back existing retro chrome**: remove the global `.crt-scanlines` overlay and flicker effects; keep monospace numerals, terminal text loaders, static panel textures.
- **Cinematic high-stakes moments**: wipeouts/big wins get 1.5–2.5s ceremonies (suspense beat → reveal w/ edge flash, shake, stinger). Everything frequent stays ≤300ms.
- **Sound ON by default** (post first-interaction unlock — existing pattern in `use-sfx.ts` already does this), global mute + volume persisted.
- **Ticker tape = upgraded bottom tape**: scrolling marquee of headline events, portfolio P&L pinned at one end.
- **Accent heat: brighten live data only** — hotter phosphor green/amber + subtle glow for P&L/balances/ticker; gold/cream chrome stays muted.
- All four areas (desk/money, feed/wire, high-stakes, leaderboard) matter; phases ranked impact-to-effort.

## Scope boundary (explicit)

**Presentation layer only.** Do NOT touch: Convex schema, server function logic, agent runtime, API routes, contract logic, money math. Allowed client-side: `.withOptimisticUpdate` on existing `useMutation` calls in hooks. **No new server queries** — the ticker and moments reuse subscriptions already active on the page (`agentActivityLog.listRecentGlobal`, `deals.listRecentCreatedForToasts`); Convex dedupes identical subscriptions, so zero added backend load.

## Throttle/batch flags (from exploration — bake into every phase)

1. **`usePortfolio` + `useLeaderboard` re-run on invisible `updatedAt` bumps** (full scans, no displayed-value change). → Gate every animation on `format(prev) !== format(next)`; FLIP only fires when row _order_ changes.
2. **Feed rows arrive in bursts** (an agent cycle writes several `agentActivityLog` rows at once, ~every 10 min/trader). → Stagger arrivals 60ms apart, cap stagger at 6 rows; never N simultaneous full-intensity flashes. Ceremony system coalesces a burst to its single highest-severity moment (wipeout > win > loss).
3. **Cycle countdown + market-hours countdown tick every 1s client-side** (`useSecondTick`). → Never wrapped in AnimatedNumber; excluded from flash treatment.

## Design principles

- Frequent ≤300ms; ceremonies 1.5–2.5s, one at a time, only for _your_ desk's traders.
- Never animate on first mount / initial subscription load / refetch.
- `prefers-reduced-motion`: CSS media query zeroes all new `mc-*` animations (flashes degrade to brief static color holds, marquee becomes static); `useReducedMotion` hook guards all rAF/JS-driven motion.
- All timing/easing/colors/glow/volume tunable from one place.

---

## Phase 0 — Foundations: tokens, reduced-motion, retro dialback, README

_Highest leverage, lowest effort; everything else consumes this._

**Create:**

- `src/lib/motion-tokens.ts` — single source of truth:
  ```ts
  export const DUR = {
    fast: 120,
    base: 200,
    slow: 300,
    number: 450,
    flash: 600,
    suspense: 550,
    ceremony: 1900,
  };
  export const EASE = {
    snap: "cubic-bezier(0.2,0.9,0.3,1)",
    out: "cubic-bezier(0.16,1,0.3,1)",
  };
  export const STAGGER_MS = 60;
  export const STAGGER_CAP = 6;
  export const SFX = {
    master: 0.7,
    tick: 0.02,
    ping: 0.05,
    win: 0.06,
    loss: 0.06,
    stinger: 0.08,
  };
  ```
- `src/hooks/use-reduced-motion.ts` — `useSyncExternalStore` over `matchMedia("(prefers-reduced-motion: reduce)")`.

**Modify:**

- `src/app/globals.css`:
  - Mirrored `/* MOTION TOKENS — sync with src/lib/motion-tokens.ts */` block on `:root`: `--mc-dur-*`, `--mc-ease-*`, `--mc-stagger`, `--mc-glow: 1` (global intensity knob — all glows written `calc(8px * var(--mc-glow))`), `--mc-flash-up/down`.
  - Hot live-data accents: `--t-green-hot: #92f5b8`, `--t-amber-hot: #ffd58a`; `.mc-live-value` utility (hot color + phosphor `text-shadow` scaled by `--mc-glow`).
  - `@media (prefers-reduced-motion: reduce)` block killing all `mc-*` animations; flash utilities degrade to held color.
  - **Delete** `.crt-scanlines` (globals.css:138) and `live-toast-flicker` keyframes + `.live-toast-scan` (globals.css:295). **Keep**: `cursor-blink`, `live-pulse`, `cursor-money`, `terminal-panel`, `crt-line-grid` (static texture = tasteful), toast enter/shake.
- Remove `crt-scanlines` class from all usage sites (verified by grep): `src/app/page.tsx:175,341`, `src/app/global-error.tsx:20`, `src/app/traders/[traderId]/page.tsx:83`, `src/app/admin/wire/wire-admin-client.tsx:23,36,97`, `src/components/deal-detail.tsx:143`, `src/components/trader-detail.tsx:224`, `src/components/public-trader-dialog.tsx:97`, `src/components/trader-creation-flow.tsx:118`, `src/components/wire/create-deal-dialog.tsx:336`.
- `src/components/live-game-toasts.tsx:219` — drop the flickering `.live-toast-scan` overlay div.
- `README.md` — fix tech stack table (line 29 `TanStack React Query` → `Convex reactive queries (convex/react hooks)`; line 34 `Supabase (Postgres + Realtime)` → `Convex (reactive database + scheduler/crons)`); also line 93 (`hooks/ # TanStack Query hooks` → Convex hooks) and the architecture diagram at line ~133 mentioning Supabase.

**Verify:** `pnpm lint && pnpm build`; visual pass (dashboard, dossier, admin wire, dialogs) — confirm panels still read well without scanlines; toggle macOS Reduce Motion.

---

## Phase 1 — Desk & money: AnimatedNumber + micro-interactions + optimistic updates

_User priority #1; touches every screen._

**Create:**

- `src/lib/animated-number.ts` — pure helpers (easing, retarget state machine) so logic is unit-testable like the repo's other `lib/*.test.ts`.
- `src/components/animated-number.tsx`:
  ```tsx
  <AnimatedNumber
    value={n}
    format={formatMoney}
    live
    flash="auto"
    className="…"
  />
  ```
  Key decisions:
  - **First-mount suppression** (`mountedRef`) — render `format(value)` directly.
  - **Change gate**: skip when `format(prev) === format(next)` — kills invisible-recompute noise (throttle flag #1).
  - **rAF odometer** over `DUR.number` w/ ease-out; on new value mid-flight, **retarget** from current eased position (no queue — rapid bursts converge).
  - **Flash**: keyed `<span key={flashKey} data-dir="up|down" className="mc-num-flash">` — remount restarts the CSS animation reliably; keyframes `mc-num-flash-up/down` (brief hot green/red + glow → settle).
  - Reduced motion: instant value swap; flash degrades to static color hold via media query.
  - Always `tabular-nums`.

**Apply to every money surface** (DatumCell already accepts `ReactNode` — pass AnimatedNumber at call sites):

- `src/app/page.tsx`: StatusCell Cash/Equity (top bar), `MarketPlayersPanel` equity + P&L cells, desk trader rows equity/P&L, BottomTape P&L (interim until Phase 2). **Not** the countdown cells (throttle flag #3).
- `src/components/deal-detail.tsx` (DealMetricGrid pot/entry/fee), `src/components/trader-detail.tsx` (TraderDeskSummaryStrip), `src/components/wire/wallet-dialog.tsx` (balances), `src/components/wire/wire-stats-bar.tsx` (total pots).

**Micro-interactions:**

- `src/components/ui/button.tsx` CVA base: `active:scale-[0.97]` + `transition-[transform,color,background-color] duration-[var(--mc-dur-fast)] ease-[var(--mc-ease-snap)] motion-reduce:active:scale-100`. Same treatment on the bespoke bordered buttons in `page.tsx` / `feed-line.tsx` (they don't use ui/button).
- **Optimistic updates** (client-only):
  - `dealApprovals.approve/reject` → `.withOptimisticUpdate` removing the approval from `api.dealApprovals.listPending` and patching `api.dealApprovals.getById` status (args must match exactly; preserve full doc shape via spread).
  - Trader pause/resume → patch `api.traders.getById` + mapped `listByDesk` status.
  - Hook files: `src/hooks/use-convex-approvals.ts`, `src/hooks/use-agent.ts` (or wherever the mutation wrappers live — confirm at implementation).
- **Skeletons**: `src/components/ui/skeleton-line.tsx` — shimmer blocks (`mc-shimmer` keyframe, gold-on-dark gradient) shaped like desk-row / leaderboard-row / feed-row; rendered under the existing `LoadingLine` terminal text in the three panel loading branches (keeps the terminal aesthetic, replaces "blank panel + blinking text" feel).

**Verify:** vitest for retarget/gate helpers; manual — fund a trader and watch cash/equity roll; approve from a feed row → CTA disappears instantly (optimistic); leaderboard idle (no animation on invisible recomputes).

---

## Phase 2 — Feed/wire liveliness + ticker tape

**Create:**

- `src/hooks/use-new-item-ids.ts`:
  ```ts
  useNewItemIds<T>(items: T[] | undefined, getId: (t: T) => string): ReadonlyMap<string, number> // id → burst index
  ```
  Seeds a ref `Set` on first non-undefined result (returns empty map — **no animation on initial load**); afterwards returns unseen ids in order, then marks seen. Same proven pattern as `seedLiveToastSeenIds` in `src/lib/live-game-toasts.ts`. Filter changes don't re-fire (ids already seen).
- `src/components/ticker-tape.tsx` — replaces `BottomTape` (`page.tsx:2527`, rendered at `page.tsx:471`):
  - Pinned left block: status + desk P&L (AnimatedNumber, `.mc-live-value`) + approvals count, solid bg + right-edge fade mask.
  - Marquee: `overflow-hidden`, flex track with headline list rendered **twice** (second `aria-hidden`), keyframe `mc-marquee { to { transform: translateX(-50%) } }`, duration `max(30, items*4)`s via inline CSS var, `:hover` pauses, reduced-motion = static latest-two-headlines row. Pad with repeats when content is narrower than the container.
  - Data: `useGlobalActivity()` filtered to win/loss/wipeout/enter + new-deal items from the toasts query — both subscriptions already active on the page. Last ~20, newest first.

**Modify:**

- `src/components/feed-line.tsx`: optional `isNew?: boolean; burstIndex?: number` props → `mc-feed-enter` (slide-in 6px + accent-soft bg highlight fading, ~280ms), `animationDelay: calc(var(--mc-stagger) * min(burstIndex, CAP))`. Win/loss/wipeout rows get a stronger green/red left-edge flash variant (throttle flag #2 handled by stagger+cap).
- `src/app/page.tsx` `TraderFeedPanel` (~2285): wire `useNewItemIds(activity, a => a.id)` into FeedLine props.
- Wire panel / `src/components/wire/wire-drop.tsx`: `useNewItemIds(drops, d => String(d.epoch))` → arrival animation on `WireDropBlock`; hook for wire-tick SFX (lands in Phase 3).
- `src/app/page.tsx`: swap `<BottomTape/>` → `<TickerTape/>`.

**Verify:** vitest for `useNewItemIds` (seed/no-fire-on-first-load/burst indexing); trigger or wait for an agent cycle → staggered arrivals; hover tape pauses; reduced-motion static tape.

---

## Phase 3 — High-stakes ceremony + sound design

**Create:**

- `src/lib/moments.ts` — pure + testable: `selectMoments(newEntries, ownedTraderIds, traderNames)` → `Moment[]` (`kind: "wipeout" | "win" | "loss"`, amount); coalesces a burst to its highest severity (wipeout > win > loss).
- `src/hooks/use-moments.ts` — feeds desk activity through `useNewItemIds` (never fires on initial load); backup wipeout trigger: diff trader `status` in a ref map, emit on `active → wiped_out`, dedup by traderId within 30s window. Queue, play one at a time.
- `src/components/moments/moment-overlay.tsx` — portal, `pointer-events-none`, `z-[80]`; phases driven by CSS animation-delays from tokens:
  1. **Suspense** (~550ms): backdrop dim + centered terminal card typing `MARGIN CALL — GORDON…` w/ cursor-blink.
  2. **Reveal** (~1.2s): full-viewport inset box-shadow edge flash (red for wipeout/loss, hot green for win); shake (`mc-shake`, wipeout only); amount via AnimatedNumber; stinger fired on a `setTimeout(DUR.suspense)` aligned with the CSS delay.
  3. Settle + auto-dismiss at `DUR.ceremony`.
     Reduced motion: static banner + held edge color, no shake.
- `src/components/sound-controls.tsx` — co-locates MusicPlayer + SFX volume/mute in one control.

**Modify:**

- `src/hooks/use-sfx.ts`:
  - Move `enabled` to module-level shared state via `useSyncExternalStore` (today each `useSfx()` instance holds its own `useState` — toggles desync across consumers).
  - Master `GainNode` w/ persisted volume (`mc-sfx-volume`, default `SFX.master`); route all tones through it. Default-ON behavior preserved (`mc-sfx-enabled !== "false"`).
  - New procedural tones (reuse existing `playTone`): `playWireTick` (quiet 1.5kHz blip), `playWin` (ascending cha-ching cluster), `playLoss` (110→55Hz thud), `playApprovalPing` (1.2kHz triangle 80ms), `playStinger` (3-note sawtooth arpeggio).
  - Per-sound rate limiting (e.g., wireTick ≥150ms apart) for bursts.
- `src/app/page.tsx`: render `<MomentLayer/>` beside `<LiveGameToasts/>`; pass suppression ids into LiveGameToasts so an own-desk wipeout doesn't double-fire toast + ceremony (small optional param in `selectNewLiveGameToasts`, `src/lib/live-game-toasts.ts`).
- Approval feedback: no overlay — Phase 1 optimistic removal + `playApprovalPing` + brief green/red flash on Approve/Deny buttons (`feed-line.tsx`, `deal-approval-dialog.tsx`, `pending-approval-card.tsx`).

**Verify:** vitest for `selectMoments` + toast suppression (mirror existing `live-game-toasts` test pattern); manual via temporary dev-only trigger keybinding (removed before commit); confirm one ceremony at a time and toasts still cover other desks' events.

---

## Phase 4 — Leaderboard drama (FLIP + rank deltas + session movers)

**Create:**

- `src/hooks/use-flip-list.ts` — FLIP without a library: callback refs into `Map<id, HTMLElement>`; measure `offsetTop` (relative to the scroll container, **not** `getBoundingClientRect` — rows live in `overflow-y-auto`) in `useLayoutEffect` **only when the id-order signature changes**; apply inverted `translateY` with no transition, next frame release to `transition: transform var(--mc-dur-slow) var(--mc-ease-out)`. Skips first measure + reduced motion. Value-only updates never trigger (throttle flag #1).
- `src/hooks/use-rank-deltas.ts` — ref map of previous ranks → `↑2`/`↓1` badges with 4s fade. Streaks/movers: `sessionStorage["mc-lb-history"]` (`id → { lastPnl, streak }`); ≥3 consecutive same-direction P&L changes shows a streak chip. Explicitly session-scoped — the backend has no streak data and we're not adding queries.

**Modify:**

- `src/app/page.tsx` `MarketPlayersPanel` (~2427): wire `useFlipList`/`registerRow` onto rows, rank-delta badge next to the `#` cell; money cells already animated from Phase 1.

**Verify:** wait for/simulate a rank swap → rows glide; React Profiler/visual check that idle recomputes cause zero animation; reduced motion = instant reorder, delta badges only.

---

## Sequencing

Phase 0 blocks all. Phases 1 ⫫ 2 (independent after 0). Phase 3 needs 1 (AnimatedNumber) + 2 (`useNewItemIds`). Phase 4 needs 1 only.

## Verification (end-to-end, per phase + final)

1. `pnpm lint && pnpm build` clean; vitest for `animated-number` helpers, `use-new-item-ids`, `moments`.
2. Run `pnpm dev`, drive the dashboard in a browser (chrome-devtools MCP available): fund/approve/pause flows for optimistic + flash behavior; observe an agent-cycle burst for staggered feed arrivals; hover-pause the ticker; trigger a moment via the temporary dev keybinding.
3. Toggle OS Reduce Motion → marquee static, flashes become color holds, no FLIP/shake.
4. Audio: first interaction unlocks; mute persists across reload; toggle synchronized everywhere.
5. Tune-check: change `--mc-glow` and a duration in `motion-tokens.ts`/`:root` and confirm a single edit shifts the whole feel.
