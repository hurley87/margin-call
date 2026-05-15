# Wire Narrative Engine — Phase / MaterialChange / Strict Category Refactor

## Context

Max-tension storyline arcs (tension ≥ 9) on the hourly Wire Drop keep regenerating the same "imminent collapse" / "pressure mounts" / "liquidation looms" language, drop after drop. The model is allowed to escalate without ever landing a concrete event, and the same arc stays designated `[PRIMARY]` indefinitely. The fix is structural, not editorial: the model needs (a) explicit narrative-arc _phases_ to advance through, (b) a _materialChange_ object it must fill in when the post-suppression primary arc is tension ≥ 9, (c) richer prompt context (confirmed facts, open questions, do-not-repeat list, current phase), and (d) forced rotation when an arc has held `[PRIMARY]` two drops in a row. Validation gets stricter so that vague escalation-only drops are rejected outright. Dispatch `category` is also tightened from a free string to a strict enum.

Out of scope: any feature work on the admin UI beyond a single phase chip and the type plumbing to keep it compiling.

---

## Decisions

| Topic                            | Decision                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase authority                  | LLM emits phase in `arcUpdates[]`; validator only checks enum membership. No state-machine, no tension-floor coupling, no auto-advance.                                                                                                         |
| materialChange scope             | Required only on exactly one `role=main` dispatch whose `arcSlug` matches the **post-suppression** primary arc, when that arc's tension ≥ 9. If zero or multiple dispatches match, reject the epoch.                                            |
| materialChange shape             | Strict: `{ kind: enum, entitySlug: string (must be on roster), magnitude?: { unitsUsdc?: number, label?: string } }`. Kind enum: `asset_loss \| personnel_exit \| regulatory_action \| counterparty_break \| filing \| position_unwind`.        |
| Vague-escalation check           | Purely structural — missing/invalid `materialChange` is the only signal. No phrase blocklist, no body heuristic.                                                                                                                                |
| Arc rotation                     | Suppress the arc from the assembler's arcs list for the next assembly only after 2 consecutive successful drops with that arc as top. The suppressed arc can return on the following drop if it is still high tension.                          |
| Rotation counter                 | Computed at assembly time from `marketNarratives.topArcTitle` on the last 2 successful drops. No new column. Only suppress when the repeated title resolves to exactly one active arc; if active titles are duplicated, do not suppress.        |
| Top-arc for MC rule              | The **post-suppression** PRIMARY arc the LLM actually sees. If rotation makes the new #1 tension < 9, the MC rule lapses for that drop.                                                                                                         |
| Persisted top-arc                | For newly generated rows, `topArcTitle` and `topArcTension` refer to the same post-suppression primary arc used for the MC rule, after applying that arc's accepted `arcUpdates` delta. This keeps rotation observable without adding a column. |
| Counter advancement              | Only successful drops increment. Skipped slots don't count (already true since counter is read from persisted `marketNarratives`).                                                                                                              |
| Category enum                    | `wire \| floor_talk \| sec_watch \| boardroom \| ticker \| positioning \| deal_seed`. Legacy `"market"` is accepted and normalized to `"wire"` before validation.                                                                               |
| Role × category                  | Orthogonal — both kept. `role=deal_seed` dispatches must have `category=deal_seed` (cross-field check).                                                                                                                                         |
| Deal seed × MC                   | A `role=deal_seed` dispatch is exempt from the materialChange rule even when it references the top arc.                                                                                                                                         |
| Confirmed facts / open questions | LLM-emitted per epoch, persisted on `marketNarratives` row, fed back into prompt from last 10 drops. Treat them as structured continuity notes from accepted drops; do not claim external truth verification.                                   |
| Do-not-repeat list               | Recent dispatch headlines from the last 10 drops (already in assembler context — repackaged with explicit instruction).                                                                                                                         |
| Phase persistence                | `narrativeArcs.phase` optional and absent until first `arcUpdate` sets it. No seed-import backfill.                                                                                                                                             |
| Phase hint to LLM                | Describe current phase only; the LLM decides whether to advance.                                                                                                                                                                                |
| Validation failure UX            | Log and skip the slot (unchanged).                                                                                                                                                                                                              |
| Migration                        | Schema-only: new fields optional. Hardcoded fallback system prompt updated. DB `systemPrompts` row left alone (operator's call).                                                                                                                |
| UI                               | Types + one small uppercase phase chip beside the tension score in `wire-admin-client.tsx`.                                                                                                                                                     |
| Preserved untouched              | Deal-seed cadence (`epochValidator.ts:72-103`), `dispatchKey` repair (`epochNormalizer.ts`), opening-bell logic, trading-hours gate.                                                                                                            |

---

## Ambiguity Resolutions

| Requirement                                      | Ambiguity                                                                                                          | Interpretation A                                                                 | Interpretation B                                                                                                                             | Recommendation                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Legacy category normalization with a strict enum | A schema-level enum would reject `"market"` before the normalizer can rewrite it.                                  | Make the runtime schema strict and remove the legacy alias.                      | Accept `"market"` only in the raw generated-input schema, normalize to `"wire"`, and validate/store only the strict enum.                    | Use B. It preserves back-compat while keeping all persisted and validated data strict.      |
| `materialChange` on the primary dispatch         | "The dispatch" does not say what happens if the LLM emits zero or multiple `role=main` dispatches for the top arc. | Accept the first matching dispatch.                                              | Require exactly one matching dispatch and reject zero or multiple matches.                                                                   | Use B. It makes validation deterministic and avoids hidden ordering behavior.               |
| Rotation duration                                | "Suppress after 2 consecutive drops" could mean suppress forever while the arc remains highest tension.            | Keep suppressing as long as the last two persisted rows have the same top title. | Suppress for one generated drop, then let the arc compete again.                                                                             | Use B. It prevents permanent starvation without adding state.                               |
| Rotation title matching                          | `marketNarratives.topArcTitle` is a title, not a slug, and titles are not schema-enforced unique.                  | Suppress the first active arc with the repeated title.                           | Suppress only when the repeated title maps to exactly one active arc.                                                                        | Use B. It avoids suppressing the wrong arc if data is malformed.                            |
| Persisted top arc during suppression             | The row could persist the actual highest-tension DB arc or the primary arc shown to the LLM.                       | Persist the highest-tension DB arc even if it was hidden from the prompt.        | Persist the post-suppression primary arc used for prompt and validation.                                                                     | Use B. It keeps rotation and validation based on the same observable value.                 |
| Optional vs nullable storage fields              | "Optional" and "nullable" imply different Convex shapes.                                                           | Store missing continuity arrays as `null`.                                       | Omit absent continuity arrays and only store arrays when present.                                                                            | Use B. It matches existing optional-field back-compat patterns and avoids two empty states. |
| Prompt continuity list contents                  | "Recent headlines" could mean drop titles, dispatch headlines, or a capped subset.                                 | Use drop titles from the last 10 drops.                                          | Use dispatch headlines from the last 10 drops, preserving newest-first drop order, capped at 30 total headlines.                             | Use B. It targets repeated dispatch language and has a deterministic cap.                   |
| Phase persistence value before first update      | The spec says optional but also says null until first update.                                                      | Backfill or write explicit `null` for every arc.                                 | Leave the field absent on existing rows; code treats absent as no phase.                                                                     | Use B. It avoids a data migration and matches the no-backfill decision.                     |
| Verification requirements                        | Manual dashboard inspection and lint cleanliness are environment-dependent in this repo.                           | Require them as pass/fail gates.                                                 | Keep verification to automated wire tests, build/type checks, and a targeted UI render check; do not require known-preexisting lint cleanup. | Use B. It verifies this change without making unrelated repo debt part of the scope.        |

---

## File-Level Plan

### 1. `convex/wire/_schemas.ts` — schema surface

- Add `CategoryEnum`: `z.enum(["wire", "floor_talk", "sec_watch", "boardroom", "ticker", "positioning", "deal_seed"])`.
- Add `CategoryInputEnum`: `z.union([CategoryEnum, z.literal("market")])` for raw LLM/generated input only.
- Add `PhaseEnum`: `z.enum(["rumor", "crack", "panic", "rupture", "fallout", "countermove", "resolution"])`.
- Add `MaterialChangeKindEnum`: `z.enum(["asset_loss", "personnel_exit", "regulatory_action", "counterparty_break", "filing", "position_unwind"])`.
- Add `MaterialChangeSchema`:
  ```ts
  z.object({
    kind: MaterialChangeKindEnum,
    entitySlug: z.string().min(1),
    magnitude: z
      .object({
        unitsUsdc: z.number().positive().optional(),
        label: z.string().min(1).max(60).optional(),
      })
      .optional(),
  });
  ```
- `DispatchSchema`:
  - raw generated input accepts `CategoryInputEnum` so `"market"` can be normalized before validation.
  - normalized/validated dispatches use `CategoryEnum`; `"market"` must not survive past `normalizeGeneratedEpoch`.
  - Add `materialChange: MaterialChangeSchema.nullable().optional()`.
- `ArcUpdateSchema`: add `phase: PhaseEnum.optional()`.
- `NarrativeEpochSchema`: add
  - `confirmedFacts: z.array(z.string().min(1).max(160)).max(8).optional()`
  - `openQuestions: z.array(z.string().min(1).max(160)).max(6).optional()`
- Export new types: `Phase`, `Category`, `MaterialChange`, `MaterialChangeKind`.

### 2. `convex/schema.ts` — Convex table updates

- `narrativeArcs`: add `phase: v.optional(v.string())`. No backfill.
- `marketNarratives`: add `confirmedFacts: v.optional(v.array(v.string()))`, `openQuestions: v.optional(v.array(v.string()))`. Do not write `null`; omit the fields when absent.
- Indexes unchanged.

### 3. `convex/wire/epochNormalizer.ts` — extend with category alias

- Keep the existing `dispatchKey` repair behavior verbatim (the user explicitly requires it preserved).
- Add a second pure normalization step before strict validation: walk `dispatches[]` and rewrite `category === "market"` to `"wire"`. Surface in the return object: `repairedCategoryAliases: number`.
- This is the only "lenient on input" path; everywhere else is strict.

### 4. `convex/wire/epochValidator.ts` — stricter rules

New `ctx` fields:

```ts
{
  arcSlugs, entitySlugs, forbiddenLanguage, requireDealSeed,        // existing
  topArcSlug: string | null,        // post-suppression primary arc slug
  topArcTension: number,            // post-suppression primary arc tension
}
```

New checks (added after existing ones, before the forbidden-language pass):

1. **Cross-field role/category** — for each dispatch, if `role === "deal_seed"` then `category` must equal `"deal_seed"`; reject otherwise. (Schema enforces the enum; this check enforces the pairing.)
2. **materialChange roster check** — for every dispatch with a non-null `materialChange`, `materialChange.entitySlug` must be in `ctx.entitySlugs`. Reject if not.
3. **Required materialChange when top tension ≥ 9** — if `topArcSlug !== null && topArcTension >= 9`, find the unique dispatch where `role === "main" && arcSlug === topArcSlug`. If found, it must have a non-null `materialChange`. Reject otherwise with a specific error.
   - Rejection message must be specific enough for log triage: `"max-tension primary arc \"<slug>\" requires materialChange on its role=main dispatch"`.
   - If no dispatch matches `role=main + arcSlug=topArcSlug`, also reject (`"max-tension primary arc must be carried by a role=main dispatch"`).
   - If more than one dispatch matches `role=main + arcSlug=topArcSlug`, reject (`"max-tension primary arc must be carried by exactly one role=main dispatch"`).
4. **Phase enum on arcUpdates** is enforced by the schema; no additional validator pass needed.

Existing checks (unique dispatch keys, deal-seed integrity, cadence, arc/entity roster, forbidden language) are unchanged.

### 5. `convex/wire/epochAssembler.ts` — richer prompt context

Add new optional inputs to `AssemblerInput`:

- `arcs: ArcCtx[]` gains an optional `phase?: string | null`.
- `recentDrops` items gain optional `confirmedFacts?: string[]` and `openQuestions?: string[]`.

Pass-through changes by the generator (§6) handle:

- **Arc suppression**: arcs selected for the one-drop suppression rule are filtered out of the array before being passed. The assembler itself is suppression-agnostic.

New prompt sections rendered by `assembleUserMessage`:

- In `ACTIVE STORYLINE ARCS`: append ` — phase: <phase>` to each arc line when phase is set.
- New section `CONFIRMED FACTS (do not contradict; do not re-announce):` — flattened list of `confirmedFacts` from the last 10 drops (dedup, cap at 20 lines).
- New section `OPEN QUESTIONS (still unresolved):` — flattened list of `openQuestions` from the last 10 drops (dedup, cap at 12).
- New section `DO NOT RE-ANNOUNCE AS NEW (recent headlines):` — dispatch headlines from the last 10 drops, newest-first by drop and original dispatch order within each drop, deduped, capped at 30 total headlines. (Existing `RECENT WIRE DROPS` block stays — this one is the explicit "don't repeat" framing.)
- New conditional block `MATERIAL EVENT REQUIRED` — emitted only when the top arc shown is at tension ≥ 9. Names the arc and instructs the LLM to populate `materialChange` on the `role=main` dispatch for that arc, with reference to the kind enum and required fields.
- New phase guidance line in the system context: a short legend `Phases: rumor → crack → panic → rupture → fallout → countermove → resolution. Emit a phase on arcUpdates only when the arc shifts.`

### 6. `convex/wire/generator.ts` — orchestration changes

a. **Compute consecutive-primary count + suppression.** Before invoking the assembler:

```ts
const last = await internal.listRecentDrops({ limit: 2 });
const topTitles = last.map((d) => d.topArcTitle).filter(Boolean);
const repeatedTopTitle =
  topTitles.length === 2 && topTitles[0] === topTitles[1] ? topTitles[0] : null;
const matchingActiveArcs = repeatedTopTitle
  ? arcs.filter((a) => a.title === repeatedTopTitle)
  : [];
const suppressedSlug =
  matchingActiveArcs.length === 1 ? matchingActiveArcs[0].slug : null;
const assemblerArcs = suppressedSlug
  ? arcs.filter((a) => a.slug !== suppressedSlug)
  : arcs;
```

Suppression removes the arc from the prompt list entirely for this assembly. The arc still exists in the DB; tension is untouched.

b. **Derive post-suppression top-arc** from `assemblerArcs[0]` and pass to validator as `topArcSlug` / `topArcTension`. If `assemblerArcs` is empty (degenerate), both are null/0.

c. **Persist the post-suppression top-arc**: after validation, compute the persisted `topArcTitle` / `topArcTension` from the post-suppression primary arc, applying that arc's accepted `tensionDelta` and clamping 0-10. If there is no post-suppression primary arc, persist `"Unknown"` and `0`.

d. **Update the hardcoded fallback `FALLBACK_NARRATIVE_GENERATION_SYSTEM` prompt** to teach the new contract:

- Phase enum and emission rule (`phase` optional on `arcUpdates[i]`).
- Category enum (strict list; `wire` is the default channel).
- `confirmedFacts[]` and `openQuestions[]` top-level outputs (each ≤ 160 chars, capped at 8/6).
- `materialChange` shape and the rule: "when the PRIMARY arc tension ≥ 9, the role=main dispatch carrying that arc MUST set `materialChange`. Use the `kind` enum. `entitySlug` must be a known roster entity. Magnitude is optional but encouraged."
- Explicit anti-pattern note: "Do not satisfy the requirement with vague escalation language alone — the structured `materialChange` is what counts."
- Preserve all existing instructions: dispatchKey requirements, dispatch count/role rules, dealSeed cadence, tone, style, forbidden language.

e. **Persist** new fields when writing the drop (see §7).

f. **No retry on validation failure** — current `log + skip slot` behavior is preserved.

### 7. `convex/wire/persist.ts` — writes

- When persisting a generated epoch, write `confirmedFacts` and `openQuestions` onto the new `marketNarratives` columns only when the arrays are present.
- When applying `arcUpdates`, if an update has `phase`, write `phase` to `narrativeArcs.phase` alongside the existing `tensionScore` mutation.
- No other changes; `dispatchKey` matching, deal seeds, and wireDealSeeds rows untouched.

### 8. `convex/wire/internal.ts` — read for new context

- `listRecentDrops` result must include `confirmedFacts` and `openQuestions` so the assembler can read them. If the query still returns full `marketNarratives` docs, no projection code is needed.

### 9. `convex/wire/operatorQueries.ts` — type plumbing for admin UI

- Add `phase` to the returned arc shape (optional string). No other changes.

### 10. `src/app/admin/wire/wire-admin-client.tsx` — minimal UI

- Rendering: in the arc list, render a small uppercase text chip immediately beside the existing tension score when `phase` is present. Use existing local utility styling; no new component and no layout refactor.
- No other UI changes.

### 11. `convex/wire/_schemas.ts` exports → consumers

Any callers importing `Dispatch`, `NarrativeEpoch`, etc., automatically pick up the new optional fields. Spot-checked: only `convex/wire/*` and the admin client import these types.

---

## Tests — `tests/convex/wire-epoch-validator.test.ts` and friends (Vitest)

New cases added to the validator test:

1. **Reject vague max-tension drop.** Fixture: arcs include `arc-collapse` with tension 10; dispatches include `role=main, arcSlug=arc-collapse` with body "pressure mounts, liquidation looms" and **no** `materialChange`. Expect `ok: false` with error matching `/requires materialChange/`.
2. **Accept max-tension drop with concrete materialChange.** Same fixture but with `materialChange: { kind: "asset_loss", entitySlug: "marty-vale", magnitude: { unitsUsdc: 340_000_000 } }`. Expect `ok: true`.
3. **Reject category outside enum.** Fixture with `category: "rumor-mill"`. Expect schema-level rejection.
4. **Legacy "market" category normalizes.** Fixture passed through `normalizeGeneratedEpoch` first with `category: "market"`. Assert: after normalize, category is `"wire"`; validate then succeeds.
5. **Reject role=deal_seed dispatch with category ≠ deal_seed.** Cross-field check.
6. **Reject materialChange with off-roster entitySlug.** materialChange present, entitySlug `"unknown-bank"` not in roster. Expect rejection.
7. **Phase enum.** `arcUpdates[i].phase = "boom"` (not in enum) → schema rejection. `phase = "panic"` → accept.

New cases in `tests/convex/wire-generator.test.ts`:

8. **Rotation: same primary arc twice in a row → suppressed on third assembly.** Seed 2 successful drops with `topArcTitle === "PanAtlantic Crisis"`. Stub the LLM to capture the user message. Assert the assembled prompt does NOT contain that arc's slug or title in the `ACTIVE STORYLINE ARCS` section.
9. **Rotation is one generated drop, not permanent starvation.** Seed 2 successful drops with `topArcTitle === "PanAtlantic Crisis"`. On drop 3, assert PanAtlantic is suppressed and the persisted generated row's `topArcTitle` is the post-suppression primary arc. On drop 4, assert PanAtlantic is eligible to appear again.
10. **Rotation counter respects skipped slots.** Seed: drop 1 successful (top=arc-X), drop 2 rejected/skipped (no row written), drop 3 successful (top=arc-X). On drop 4, arc-X should NOT be suppressed because the persisted last two successful rows are not both arc-X. Assert arc-X still appears in the prompt.

Existing fixtures: `wire-epoch-validator.test.ts:21` currently uses `category: "market"`. Update fixtures that go through the validator directly to use `"wire"`; for tests that test the normalizer alias path, keep `"market"`.

---

## Critical files (quick index)

- `convex/wire/_schemas.ts` — new enums + materialChange + new top-level fields.
- `convex/schema.ts` — `narrativeArcs.phase`, `marketNarratives.confirmedFacts`, `marketNarratives.openQuestions`, all optional.
- `convex/wire/epochNormalizer.ts` — keep dispatchKey repair untouched; add `"market" → "wire"` alias step.
- `convex/wire/epochValidator.ts` — three new checks (role/category pairing, MC roster, MC required at tension ≥ 9).
- `convex/wire/epochAssembler.ts` — new prompt sections (CONFIRMED FACTS, OPEN QUESTIONS, DO NOT RE-ANNOUNCE, MATERIAL EVENT REQUIRED, phase legend) + per-arc phase line.
- `convex/wire/generator.ts` — suppression logic + top-arc derivation + updated fallback system prompt; persistence wiring for new fields.
- `convex/wire/persist.ts` — write confirmedFacts/openQuestions on row; write `phase` on arc when arcUpdate carries it.
- `convex/wire/internal.ts` — ensure `listRecentDrops` returns continuity fields.
- `convex/wire/operatorQueries.ts` — expose `phase` per arc.
- `src/app/admin/wire/wire-admin-client.tsx` — phase chip beside tension score.
- `tests/convex/wire-epoch-validator.test.ts`, `tests/convex/wire-epoch-assembler.test.ts`, `tests/convex/wire-generator.test.ts` — new + updated cases.

## Reused utilities

- `normalizeGeneratedEpoch` (`convex/wire/epochNormalizer.ts`) — extended in place; keep existing repair contract.
- `assembleUserMessage` (`convex/wire/epochAssembler.ts`) — extended in place.
- `validateEpoch` (`convex/wire/epochValidator.ts`) — same signature with two more `ctx` fields.
- `listRecentDrops`, `listRecentSeedCadence` (`convex/wire/internal.ts`) — existing readers, with `listRecentDrops` including the new continuity fields.
- `heatColor` (`src/lib/utils.ts`) — already used in admin UI; not needed for phase chip but available.

---

## Verification

1. `pnpm test -- wire` — confirms all new + updated Vitest cases pass; existing wire suites stay green.
2. `pnpm build` — confirms the admin client compiles with the new `phase` field on operator context.
3. `pnpm lint` may still fail on pre-existing lint issues noted in `AGENTS.md`; do not use unrelated lint failures as this spec's pass/fail gate.
4. **Negative-path verification:** stub the LLM via the existing test harness to return a max-tension drop with no `materialChange`; assert the slot is skipped, no `marketNarratives` row is written, and an error is logged.
5. **Migration sanity:** seed Convex from scratch (`resetNarrativeState` action); confirm arcs have no `phase` field until an `arcUpdate` sets one, drops accumulate without continuity arrays until emitted, and the admin UI renders cleanly with no chip until phase appears.
