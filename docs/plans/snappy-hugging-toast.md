# Simplify: Portrait Backfill v3 removal

## Context

The working tree removes the operator-only "Portrait Backfill v3" admin feature (106 lines, pure deletions across three files). `/simplify` reviewed those changes for reuse, quality, and efficiency. Because the diff is pure deletion, the usual simplify findings (duplication, hot-path bloat, etc.) don't apply — the review reduces to verifying nothing was left dangling.

## Review findings

**Code-side: clean.** The deletion is internally consistent:

- `convex/portraits.ts` — `adminBackfillV3` action + `BACKFILL_MAX_PER_RUN`/`BACKFILL_MIN_STAGGER_MS` constants + now-unused `Id` import all removed together.
- `convex/traders.ts` — `listStaleForPortraitV3` internal query removed. The helpers it used (`getPortraitPromptVersion`, `PORTRAIT_METADATA_VERSION`) stay imported because they're still used at `convex/traders.ts:475-479` for the per-trader stale check.
- `src/app/admin/wire/wire-admin-client.tsx` — action hook, two `useState` pairs, `handleBackfillPortraits`, and the `PORTRAIT BACKFILL (v3)` `<section>` removed together. Surrounding sections (`Force Generate` above, `Arc Inspector` below) are intact at lines 176–178.

`grep` for every removed symbol (`adminBackfillV3`, `listStaleForPortraitV3`, `BACKFILL_MAX_PER_RUN`, `BACKFILL_MIN_STAGGER_MS`, `backfillPortraits`, `backfillStatus`, `backfillPending`, `handleBackfillPortraits`) returns zero hits in `*.ts`/`*.tsx`.

**Doc-side: out of sync.** `docs/portrait-v3-spec.md` still contains 12 mentions of the removed action — including a "Do not call `portraits.adminBackfillV3`" rule (line 20), an entire §7 description and code block (lines 68, 642, 717, 725, 746, 749), a "no integration test required" note (lines 867, 873), and a runbook step that calls `adminBackfillV3` to monitor `imageError` counts (lines 980, 982, 984, 1016).

This is the only finding. Whether to act on it depends on whether the spec is a living doc or a frozen design record — I'll ask the user before editing.

## Recommended action

Nothing on the code. Decide doc treatment with the user, then either:

1. **Update the spec** — add a short banner near the top noting the backfill section was descoped, and strike/annotate §7 + the runbook step that references it. Keeps the spec faithful to what shipped.
2. **Leave the spec alone** — treat it as a historical design doc; the code is the source of truth.
3. **Delete the backfill references entirely** — remove §7 and the runbook bullet so the doc reads as if backfill was never part of the design.

Critical files (only touched if option 1 or 3 is chosen):

- `docs/portrait-v3-spec.md` — lines 20, 68, 642, 717–746, 749, 867, 873, 980–984, 1016.

## Verification

- `pnpm lint` — confirms no unused imports / dangling references after the deletions.
- `pnpm build` — confirms Convex codegen and Next.js build still pass with `api.portraits.adminBackfillV3` and `internal.traders.listStaleForPortraitV3` gone.
- Manual: load `/admin/wire`, confirm `Force Generate` and `Arc Inspector` sections render with no gap or layout artifact where the backfill section used to be.
