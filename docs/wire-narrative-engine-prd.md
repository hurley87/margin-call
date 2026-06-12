# Wire Narrative Engine — PRD

**Status:** Draft
**Owner:** David
**Last updated:** 2026-05-06

---

## Problem Statement

Players open the Wire and see a flat list of unrelated headlines. Each post is mechanically a hook for creating a deal, but the world has no memory: characters don't recur, storylines don't develop, and game events (deal entries, wipeouts, big wins) don't echo back into the news. There is no reason to scroll past the top three items. The Wire feels like a random AP feed, not the nervous bloodstream of a cracked-up 1980s market.

This is a product problem before it is a content problem. The Wire is supposed to be the engine that pressures players into creating deals, baiting agents, and reacting to market rumor. Without continuity it is just decoration.

## Solution

Treat the Wire as a serialized story-driven feed. The world is **seeded** in code (firms, characters, regulators, active arcs, weekly shape, tone rules), then **generated** epoch-by-epoch by an LLM that is forced — by prompt and by structured input — to continue existing arcs, name recurring entities, react to actual game events, and add callbacks to past posts.

During US market hours (Mon–Fri, 09:30–16:00 ET), the engine generates one hourly **Wire Drop**. A Wire Drop is a compact terminal-style burst containing 2–3 short dispatches, not five separate article-like posts.

Each Wire Drop usually includes:

1. One main market dispatch that advances the active story arc.
2. One supporting dispatch such as Floor Talk, SEC Watch, Boardroom, or Ticker.
3. Optionally one player-funded Deal Seed when the story naturally creates a playable opportunity.

Player activity influences the next hourly Wire Drop when relevant. Routine activity shapes mood, SEC heat, arc tension, and supporting dispatches in aggregate. Dramatic activity — large entries, wipeouts, big wins/losses, crowded trades, or high-risk deals — may name the player, trader, or desk directly.

The result: a player scrolling the Wire feels like they are watching one specific market slowly lose its mind, with named characters and ongoing storylines, and regular opportunities to create or avoid deals without turning the feed into a wall of CTAs.

---

## Grill-Me Stress Test

The plan should survive these questions before implementation starts:

1. **What is the single player behavior this feature must change?** Players should create or avoid deals because the Wire made a specific rumor feel timely. If a post does not create a trading decision, it is filler.
2. **What prevents the LLM from inventing a new world every hour?** A repo-owned season seed, a persisted entity roster, active arc state, last-mentioned metadata, and validator rejection for off-roster entities in v1.
3. **What is the smallest valuable version?** Hourly reactive Wire Drops, stable recurring arcs, player-activity influence, continuity callbacks, and optional-but-frequent player-funded Deal Seeds.
4. **What is the main technical risk?** Convex action boundaries. LLM calls must happen in internal actions, while all writes happen through internal mutations. The PRD treats each generator as an action orchestrator plus transactional persist mutations, not as an action writing directly to `ctx.db`.
5. **What is the main product risk?** Dense narrative without conversion. The UI must make the deal seed affordance more specific than today's generic "$ CREATE DEAL" button and must show when a storyline is already saturated with deals.
6. **What is the main data-model risk?** Linking by headline text is brittle. Deal seeds need stable IDs and headline indexes/keys, and consumed seeds should be patched by ID when a deal is created.
7. **What gets cut if scope tightens?** Admin UI polish and forbidden-language CI can move later. The season seed, hourly Wire Drop generation, player-activity ingestion, seed conversion path, and validation cannot.

---

## User Stories

### Player — reading the Wire

1. As a desk manager, I want recurring fictional firms and traders to appear across multiple Wire posts, so that the world feels persistent and not random.
2. As a desk manager, I want each Wire post to clearly belong to a source (THE WIRE, FLOOR TALK, SEC WATCH, BOARDROOM, THE TICKER, DC INSIDER), so I can tell rumor from regulatory heat at a glance.
3. As a desk manager, I want to see the current market mood and SEC heat level pinned to the feed, so I can infer which arcs are escalating.
4. As a desk manager, I want each hourly update to render as one compact Wire Drop with 2–3 connected dispatches, so it feels like a terminal burst rather than disconnected posts.
5. As a desk manager, I want Deal Seeds to appear frequently but not mechanically in every drop, so the Wire stays actionable without feeling like a CTA machine.
6. As a desk manager, I want callbacks folded into dispatches when useful, so I can feel continuity without needing a separate callback post.
7. As a desk manager, I want recent player activity to shape the next Wire Drop, so the world feels reactive even without instant bulletins.
8. As a desk manager, I want only dramatic player/trader activity to be named directly, so normal actions do not become noisy headlines.
9. As a desk manager, I want the feed to feel paranoid and predatory — funny but not goofy — so it matches the 1980s Wall Street tone and pushes me toward action.
10. As a desk manager, I want each dispatch to imply a possible action (exploit, create, avoid, watch), so I never bounce off the page without a hook.
11. As a desk manager, I want the Wire to behave like a market terminal: dense, scannable, monospace, with no marketing fluff.

### Player — creating deals from the Wire

12. As a desk manager, I want a strong one-tap "Create Deal" entry from a Deal Seed, so I can convert a news beat into a funded deal in seconds.
13. As a desk manager, I want the seeded prompt, suggested pot, and suggested entry cost prefilled but editable in the create-deal dialog, so I keep funding control.
14. As a desk manager, I want non-seed dispatches to offer a lighter "Create from this" or "Use this as premise" action, so any dispatch can inspire a deal without cluttering the Wire.
15. As a desk manager, I want a persistent global "Create Deal" button on the Wire page, so deal creation is always available.
16. As a desk manager, I want the originating dispatch linked to my created deal, so I can later see how a story arc translated into trader behavior.
17. As a desk manager, I want multiple desks to be able to fund deals from the same Deal Seed, so a rumor can become a crowded market instead of being claimed once.
18. As a desk manager, I want seeded deals from the Wire to display linked-deal counts and total pot, so I can see how saturated a storyline is with active deals.

### Player — reacting to game events

19. As a desk manager, when one of my traders gets wiped out, I want the next Wire Drop to reflect it if it is dramatic enough, so my pain becomes part of the story.
20. As a desk manager, when many traders pile into the same deal, I want the next Wire Drop to warn about the crowded trade, so other players are pulled into or away from it.
21. As a desk manager, when SEC heat changes, I want it to influence the next Wire Drop and header state, so I know the temperature has changed without checking a stat.
22. As a desk manager, I want the Wire to occasionally name my desk or my trader by name when something noteworthy happens, so I feel personally inside the story.

### Operator — running the engine

23. As an operator, I want hourly Wire generation to run only during US market hours (Mon–Fri, 09:30–16:00 ET), so we don't burn LLM budget overnight on an empty room.
24. As an operator, I want generation to be idempotent per epoch slot, so a cron retry does not produce duplicate Wire Drops.
25. As an operator, I want LLM responses validated against a Zod schema before persisting, so malformed output never reaches the feed.
26. As an operator, I want a season seed file checked into the repo, so the canon is reviewable, diffable, and replayable.
27. As an operator, I want to import a season seed into Convex with one command, so spinning up a fresh environment is trivial.

### Operator — dev tools

28. As an operator, I want to force-generate the next Wire Drop on demand, so I can preview output without waiting an hour.
29. As an operator, I want to inspect active arcs and their tension scores, so I can debug whether the story is escalating as expected.
30. As an operator, I want a dev-only reset that clears narrative state and re-seeds, so I can iterate on canon quickly.

---

## Implementation Decisions

### A. Product framing

- **The Wire is the narrative marketplace of the game.** It is the primary surface that converts attention into deals. UX, copy, and cadence are all tuned to that conversion goal — not to "publishing news."
- **Tone target:** serialized, punchy, paranoid, predatory, 1980s Wall Street, financial-thriller-meets-market-terminal. Funny, never goofy. No emoji. No modern crypto vocabulary.
- **Reader intent test:** every post must plausibly trigger one of four player thoughts: _I can exploit this_, _I can create a deal from this_, _I should avoid this trap_, _I need to know what happens next_. Posts that fail this test are content failures, not just bland writing.

### B. Narrative hierarchy

`Season → Arc → Wire Drop → Dispatches → Optional Deal Seeds → Outcomes → Updated Arc State`

- **Season:** a weekly game cycle. Has a title, tone, weekly shape (Mon → Fri narrative beats), and a curated cast of entities and arcs. Authored in the repo and imported into Convex.
- **Arc:** an ongoing storyline (e.g. _PanAtlantic blow-up_, _Rourke takeover spree_, _Mercer investigation widens_). Has a current tension score and a list of involved entities. Lives in Convex and is mutated by generation.
- **Wire Drop:** one scheduled hourly update produced by the cron. Persists 2–3 dispatches and a world-state snapshot. Already corresponds to a `marketNarratives` row.
- **Dispatch:** one terse terminal-style item inside a Wire Drop. Evolves the existing `NarrativeHeadlineSchema` (`headline`, `body`, `category`) with `role`, continuity refs, and optional seed metadata.
- **Deal Seed:** an optional playable opportunity implied by a dispatch. Lightweight JSON, prefillable into the create-deal dialog. Player-funded only.
- **Outcome:** real game events (deal entries, resolutions, wipeouts) that feed back into the next generation cycle as input.
- **Updated arc state:** generation output may bump a tension score. In v1, the LLM may not permanently resolve or abandon major arcs; operators control resolution via dev/admin tools.

### C. Story seed / story bible

- **Authored canon lives in two places:**
  - A human-readable bible at `docs/wire/season-01.md` for narrative review and editorial.
  - A structured seed module at `convex/seeds/wireSeason01.ts` (TypeScript, typed against the season schema) that is the source of truth for import into Convex.
- The structured seed defines:
  - `title`, `weekRange`, `tone`, `forbiddenLanguage[]`, `styleRules[]`
  - `entities[]` — fictional companies, traders, regulators (each with `name`, `kind`, `role`, `aliases`, `bio`, `traits`)
  - `arcs[]` — initial storylines (each with `title`, `summary`, `tensionScore` 0–10, `entityRefs[]`, `weeklyBeat`)
  - `weeklyShape` — Mon/Tue/Wed/Thu/Fri narrative posture (rumors → cracks → mania → SEC pressure → blowups)
  - `headlineFormats[]` — example formats the LLM can reference for shape
- **Initial cast (illustrative, will be authored in season-01):**
  - PanAtlantic Holdings — overleveraged conglomerate at the center of the panic
  - Rourke Capital — aggressive takeover shop circling distressed assets
  - Blackwell & Co. — old-money investment bank, reputational ballast
  - Diane Mercer — SEC investigator tracking suspicious deal flow
  - Marty Vale — loud floor trader who spreads rumors before they hit the tape
- **Importer:** an internal Convex mutation `seasons.importSeason` that ingests the structured seed, upserts entities and arcs, and marks one season `active`. Idempotent by `seasonKey`.

### D. Data model

The existing `marketNarratives` table is reusable for scheduled epochs. We extend it rather than rename. New tables are added only where the data shape clearly does not fit.

**Extend `marketNarratives` (additive, all new fields optional):**

- `seasonId` — optional reference to `narrativeSeasons`
- `arcRefs[]` — bounded array of `narrativeArcs` IDs touched by the Wire Drop
- `epochSlot` — integer hour-of-trading-week index used as an idempotency key for the cron (e.g. week 21, slot 14)
- `dropTitle` — optional terse label for the grouped Wire Drop
- `topArcTitle`, `topArcTension` — denormalized header-strip fields so `WireStatsBar` does not need to subscribe to every arc

**New tables:**

- `narrativeSeasons` — one row per season. Fields: `seasonKey`, `title`, `weekStartAt`, `weekEndAt`, `tone`, `weeklyShape` (JSON), `styleRules` (JSON), `forbiddenLanguage[]`, `isActive`, `createdAt`. Index `byActive`, `bySeasonKey`.
- `narrativeEntities` — recurring characters/firms/regulators. Fields: `seasonId`, `slug`, `kind` (`"firm"` | `"trader"` | `"regulator"` | `"politician"`), `displayName`, `aliases[]`, `bio`, `traits[]`. Index `bySeason`, `bySeasonAndSlug`.
- `narrativeArcs` — ongoing storylines. Fields: `seasonId`, `slug`, `title`, `summary`, `status` (`"active"` | `"resolved"` | `"abandoned"`), `tensionScore` (0–10), `entityRefs[]`, `lastTouchedAt`, `createdAt`, `updatedAt`. Index `bySeason`, `bySeasonAndStatus`, `bySlug`.
- `wireDealSeeds` — one row per Deal Seed dispatch produced. Fields: `epochId` (ref to `marketNarratives`), `seasonId`, `arcId`, `dispatchIndex`, `dispatchKey`, `dispatchHeadline`, `prompt` (the prefillable deal prompt), `suggestedPotUsdc`, `suggestedEntryCostUsdc`, `createdAt`. Index `byEpoch`, `byEpochAndDispatchKey`, `byArc`.
- `wireDealSeedLinks` — one row per player-funded deal created from a seed. Fields: `seedId`, `dealId`, `deskManagerId`, `createdAt`. Index `bySeed`, `byDeal`, `byDeskManager`.

**No bulletin data path in v1.** Player activity affects the next hourly Wire Drop only. There is no event-triggered generation, bulletin queue, bulletin table, or bulletin UI.

**Indexes on `marketNarratives`:** keep `byEpoch` for existing callers, add `byCreatedAt` and `byEpochSlot`. `feedHeadlines` should become a grouped `feedDrops` query that returns recent Wire Drops newest-first with nested dispatches, world state, seed data, and linked-deal saturation.

**No new persisted fields on `deals`.** The existing `sourceHeadline` field is enough for display-level back-linking. Seed conversion passes a `wireDealSeedId` argument to the create/record mutation path; after the deal row is inserted, the mutation inserts a `wireDealSeedLinks` row in the same transaction. Multiple deals may link to the same seed; the seed is never marked "taken."

### E. Hourly Wire Drop generation

A new internal action `wire.generateNextEpoch` is invoked from a Convex cron with `crons.hourly`.

The action:

1. Computes the current US Eastern wall-clock time. Bails if outside Mon–Fri 09:30–16:00 ET. (Convex crons run in UTC; the trading-hours check is a pure helper using a fixed `America/New_York` offset table or `Intl.DateTimeFormat("en-US", { timeZone: "America/New_York" })`.)
2. Computes the current `epochSlot` index. Bails if a `marketNarratives` row already exists with that slot (idempotency for retries).
3. Loads the active season, its style rules, forbidden language, and weekly shape.
4. Loads active arcs, sorted by `tensionScore` desc; designates the highest-tension arc as the primary arc for this epoch.
5. Loads the last 5–10 Wire Drops (dispatches + arc refs + world state) for continuity context.
6. Loads recent game data not yet ingested: deals created since last epoch, dealEntries, dealOutcomes (especially wipeouts, big wins/losses, high-risk deal creation, crowded trades).
7. Loads current world state — mood and SEC heat — by inheriting from the previous epoch's `worldState`.
8. Builds a structured prompt (see §F) and calls `gpt-5-mini` via the existing `callModel` helper with a Zod schema covering: updated `worldState`, 2–3 typed dispatches, an optional `dealSeed`, an `arcUpdates[]` array (arc id → tension delta), and a list of `entityMentions`.
9. Validates the response against the schema. On any validation failure, logs the error and aborts (no row written). The next slot will retry.
10. Calls an internal mutation `wire.persistGeneratedEpoch` with the validated payload.
11. The persist mutation re-checks `epochSlot` inside the transaction, then writes one `marketNarratives` row (populated `arcRefs`, `epochSlot`, `seasonId`, `eventsIngested`, `dropTitle`, `topArcTitle`, `topArcTension`).
12. The same mutation inserts a `wireDealSeeds` row if a Deal Seed dispatch exists and applies allowed `arcUpdates` to `narrativeArcs` (tension score and `lastTouchedAt` only).

Convex boundary rule: `wire.generateNextEpoch` is an internal action because it calls the LLM. It does not write directly to the database. All reads that need indexes are internal queries; all writes are internal mutations with validators.

**Required shape of every Wire Drop (enforced by schema):**

- 2–3 concise dispatches total.
- One **main dispatch** that advances the primary active arc.
- One **supporting dispatch** that adds pressure, rumor, SEC heat, boardroom tension, ticker movement, or player/agent reaction.
- Optional one **Deal Seed dispatch** when the story naturally creates a playable opportunity.
- Continuity every drop: at least one dispatch must reference an active arc, recurring entity, prior player event, or prior dispatch.
- Hard copy caps: dispatch headlines should be about 100 characters max; dispatch bodies should be about 400 characters max (2–4 sentences).

Deal Seeds are optional per drop but mandatory over time: at least one Deal Seed must appear every 2 market-hour Wire Drops. The generator receives recent seed cadence as input, and validation rejects a second consecutive drop without a Deal Seed.

### F. Player activity policy

Player activity always influences the Wire when relevant, but players/traders are only named when the activity is dramatic enough to become part of the story.

Routine activity shapes the Wire in aggregate:

- Market mood
- SEC heat
- Arc tension
- Supporting dispatches
- General references to "desks," "traders," or "the floor"

Notable activity may be called out directly:

- A trader enters a large deal
- A desk wins or loses big
- Multiple traders pile into the same deal
- A trader gets wiped out
- A player creates a high-risk or unusually attractive deal
- Activity meaningfully changes an active narrative arc

SEC heat is global in v1. Dispatch copy can connect SEC heat to a specific arc when relevant, but there is no per-arc SEC heat model.

### G. LLM prompt design

One prompt, seeded from the existing `systemPrompts` table:

- `narrative_generation` — already exists; rewrite to enforce the Wire Drop shape, season tone, recurring entities, player-activity policy, Deal Seed cadence, and continuity requirement.

**System prompt — required directives:**

- Continue existing arcs. **Do not invent a new world every time.**
- Use only entities listed in the supplied entity roster, plus existing notable_traders when their activity is dramatic enough to name.
- Reference recent game events when supplied. They are real and must be treated as factual.
- Ensure every Wire Drop has continuity with an active arc, recurring entity, prior player event, or prior dispatch.
- Escalate tension gradually. Never resolve or abandon a major arc unless explicitly instructed by an operator.
- Avoid: emoji, modern crypto vocabulary ("DeFi", "rug", "wagmi", "wen moon", L2 names, gas fees), generic "stock market hits new high" filler, AI/tech-coded phrasing.
- Every dispatch must imply a possible player action: exploit, create, avoid, or watch.
- Dispatches must be terse terminal-style market updates, not tweets, blog posts, press releases, or marketing copy.
- Match the season tone and respect `forbiddenLanguage[]` from the active season.

**User-message structure (machine-built each epoch):**

- Active season (title, tone, weeklyShape, styleRules, forbiddenLanguage)
- Today-of-week posture (Mon = rumors, Tue = cracks, …)
- Active arcs sorted by tension, with primary arc flagged
- Entity roster (slug + displayName + traits + last-mentioned-epoch)
- Last 5–10 Wire Drop summaries (dispatches + arcRefs + world state)
- Recent game events since last epoch (deal creates, entries, outcomes, wipeouts) with trader names and dollar amounts
- Recent Deal Seed cadence (whether the previous Wire Drop contained a Deal Seed)
- Current world state (mood, SEC heat, sectors)
- Required output schema and the Wire Drop shape

**Output schema (strict JSON, validated):**

- `worldState` — updated mood, sec_heat, sectors, active_storylines, notable_traders
- `dispatches[]` — 2–3 items, each with `headline`, `body`, `category`, `role` (`"main"` | `"supporting"` | `"deal_seed"`), optional `arcRef`, optional `referenceEpoch`, optional `activityRefs[]`
- `dealSeed` — optional; `dispatchKey`, `prompt` (~28 words, ticker-wire tone), `suggestedPotUsdc`, `suggestedEntryCostUsdc`, `arcRef`
- `arcUpdates[]` — `[{ arcId, tensionDelta }]`
- `entityMentions[]` — slugs referenced in this epoch (used for last-mentioned tracking)

### H. Deal seeds — flow

For MVP, deal seeds are **stored, lightweight prompts shown inline in the Wire feed**, with a one-tap path into the existing create-deal dialog.

- A `wireDealSeeds` row is the canonical record. Generation produces it; the UI reads it.
- The Wire post that contains a seed renders a "$ CREATE DEAL FROM THIS" affordance next to the existing source line.
- Tapping that affordance opens the existing `CreateDealDialog` with `selectedPrompt` prefilled to the seed's `prompt`, `potAmount` to `suggestedPotUsdc`, and `entryCost` to `suggestedEntryCostUsdc`. The headline is passed via the existing `sourceHeadline` field on the deal.
- On successful create, the action writes `consumedDealId` back onto the seed row.
- Seeds that have been consumed render a "TAKEN" badge and a link to the resulting deal page.

We are **not** auto-creating deals from seeds in v1. They are player-pulled, not engine-pushed.

### I. UI changes

The existing `WireFeed`/`WirePost`/`WireSourceLine`/`WireStatsBar` components are retained. Changes:

- **Feed query:** `marketNarratives.feedHeadlines` is extended to also flatten `kind` (`"scheduled"` | `"bulletin"`), `arcRef`, `referenceEpoch`, and any seed link onto each feed item. Sort remains by epoch desc / createdAt desc, so bulletins interleave naturally.
- **Bulletins are visually distinct:** thicker top border, leading "BREAKING —" tag, accent color, and a tighter density. Source line shows the trigger context ("after wipeout", "after pile-on") instead of a category handle.
- **Deal seed posts** render a primary "$ CREATE DEAL FROM THIS" button with the suggested pot and entry preview. If `consumedDealId` is set, render a `[TAKEN]` badge linking to the deal.
- **Callback posts** render a small "↳ EARLIER" affordance that links to the referenced epoch (anchored scroll, no route change).
- **Header strip** continues to show MOOD and SEC heat (already wired), plus a tiny tension indicator for the top active arc.
- **Source labels** continue to come from `category`. The `WIRE_SOURCES` map is extended with one `bulletin` source if needed.
- **Empty state** is preserved.
- **No infinite scroll in v1.** The existing fixed window of recent epochs is fine.

### J. Admin / dev tools

A small set of internal Convex mutations and a thin `/admin/wire` page (auth-gated to operator subjects):

- `wire.devForceEpoch` — runs `wire.generateNextEpoch` on demand, ignoring trading-hours and idempotency guards.
- `wire.devForceBulletin` — accepts a `triggerEvent` payload and runs `wire.fireBulletin`.
- `wire.devListArcs` — returns active arcs with tension scores for inspection.
- `wire.devResetNarrative` — dev-environment-only mutation that wipes `narrativeArcs`, `narrativeEntities`, `wireDealSeeds`, and recent `marketNarratives` rows, then re-imports the active season seed.
- `seasons.importSeason` — idempotent importer used by both dev tools and a one-shot CLI script.

The admin page is a stripped-down terminal UI (no fancy widgets) consistent with the rest of the app.

### K. Module map

The implementation factors into a small set of testable modules:

- **`tradingHours`** (pure module) — given a timestamp, returns whether the market is open and the current `epochSlot` index. Pure, isolated, easy to unit-test for DST edges.
- **`epochAssembler`** (pure module) — given previous epochs, active arcs, entity roster, and recent game events, produces the structured user-message payload for the LLM. Pure JSON in / JSON out. No LLM calls.
- **`epochValidator`** (pure module) — given an LLM response object, validates schema, role coverage (5 required roles), arcRef integrity (refs exist), and entity-roster compliance (no off-roster characters). Returns a typed result.
- **`bulletinTriggers`** (pure module) — given a game event and current state, returns whether to fire a bulletin and what dedupe key to use. Pure decision logic; rate-limit lookup is a dependency injected by callers.
- **`seedImporter`** (action) — reads a structured seed module and upserts season + entities + arcs. Idempotent.
- **`wire.generateNextEpoch`** (action) — orchestrator that ties the above together and writes to Convex.
- **`wire.fireBulletin`** (action) — orchestrator for event-driven bulletins.

Pure modules are the deep modules: small interface, lots of behavior, no I/O. They are where the bugs will live and where the tests should concentrate.

### L. Cron and scheduling

- One new cron entry, `wire-epoch-generator`, registered in `convex/crons.ts` at `crons.hourly` with `minuteUTC: 5` (run at 5 minutes past every hour to give game cycles a moment to settle). The trading-hours guard inside the action is the actual gating mechanism; running the cron 24/7 and letting it bail cheaply is simpler than building a partial-week cron.
- Existing `agent-scheduler` cron is unchanged.
- Bulletin watcher for SEC heat / arc tension runs as part of `wire.generateNextEpoch` (post-write), not as its own cron — they're free to compute on top of fresh state.

---

## Testing Decisions

**What makes a good test here:** test the contracts of pure modules, and test orchestrators by stubbing the LLM call. Do not test prompt strings or the LLM's literal output. Tests should fail when behavior the player relies on changes — not when copy or wording changes.

Modules and their tests:

- **`tradingHours`** — unit-tested across DST transitions (March / November), weekends, exact 09:30 ET open, exact 16:00 ET close, holidays-ignored-for-now. Prior art: `tests/convex/pure-modules.test.ts`.
- **`epochAssembler`** — unit-tested for: ordering of arcs by tension, primary-arc selection, last-N-epoch trimming, inclusion of recent game events, omission of stale events already ingested, entity-roster shape.
- **`epochValidator`** — unit-tested for: rejects responses missing a role, rejects unknown arcRefs, rejects off-roster entity mentions, accepts a valid response.
- **`bulletinTriggers`** — unit-tested for: each trigger source produces a stable dedupe key, rate-limit window honors per-trigger config, pile-on detection thresholds, threshold crossings (SEC heat, arc tension delta).
- **`seedImporter`** — integration test using `convex-test` (prior art: `tests/convex/cycle-idempotency.test.ts`): importing the same season twice produces no duplicates; mutating the seed and re-importing updates entities; deactivates prior active season.
- **`wire.generateNextEpoch`** — integration test with a stubbed LLM client returning fixture responses: idempotent on duplicate `epochSlot`, no-op outside trading hours, writes `marketNarratives` + `wireDealSeeds`, applies `arcUpdates`.
- **`wire.fireBulletin`** — integration test with a stubbed LLM client: dedupe key prevents duplicates within window, rate limits enforced, `marketNarratives` row written with `kind: "bulletin"`.

We do not test:

- LLM output quality — that is editorial review, not test code.
- Prompt string contents — they will change.
- UI rendering of feed posts — covered by light component tests if we add them, but not blocking.

---

## Out of Scope (v1)

- Fully autonomous season planning. Seasons are authored by hand.
- Branching narrative trees / player choice that forks canon.
- Player-authored canon moderation pipeline.
- Multi-season archive UI. v1 shows the active season feed only.
- Real-time 5-minute generation cadence. Hourly + bulletins is the contract.
- Fully prewritten drip campaigns. Seed + generate is the contract.
- Personalization (per-player feed). The Wire is global.
- Localization. English only.
- Notifications / push. The Wire is read in-app.
- Image generation for posts. Text only.
- Cross-season callbacks. Each season is a fresh world.

---

## Acceptance Criteria

1. A structured season seed can be imported into Convex by running a single internal mutation; importing the same seed twice does not duplicate entities or arcs.
2. The `wire-epoch-generator` cron runs hourly, writes a `marketNarratives` row only during US market hours (Mon–Fri, 09:30–16:00 ET), and writes nothing outside that window.
3. Across a full trading day (~6 epochs), the feed contains zero off-roster entity references and at least one explicit callback per epoch, verified manually.
4. A wipeout, a big win, a high-risk-deal creation, a deal pile-on, an SEC-heat threshold crossing, and a tension-jump each produce exactly one breaking bulletin within the dedupe window.
5. Generated headlines never contain the forbidden vocabulary list (modern crypto, AI/tech-coded phrasing, emoji), validated by a CI lint that scans the latest 50 epochs.
6. Across at least 10 generated epochs, the feed visibly continues at least 2 distinct arcs, with named recurring entities appearing in at least 5 of those epochs.
7. The Wire UI visually distinguishes scheduled posts from bulletins, displays mood and SEC heat, displays a "$ CREATE DEAL FROM THIS" affordance on deal seeds, and links consumed seeds to the resulting deal page.
8. Tapping "$ CREATE DEAL FROM THIS" opens the existing `CreateDealDialog` with prompt, pot, and entry-cost prefilled from the seed.
9. All pure modules (`tradingHours`, `epochAssembler`, `epochValidator`, `bulletinTriggers`) have unit tests; the two orchestrator actions have integration tests with stubbed LLM responses.
10. Dev tools allow on-demand epoch generation, on-demand bulletin firing, arc inspection, and a dev-only narrative reset.

---

## Implementation Plan

### Phase 1 — Story seed and Convex schema

- Add `narrativeSeasons`, `narrativeEntities`, `narrativeArcs`, `wireDealSeeds` tables to `convex/schema.ts`.
- Extend `marketNarratives` with optional `kind`, `seasonId`, `triggerEvent`, `arcRefs`, `epochSlot`, `bulletinDedupeKey` fields and matching indexes.
- Author `docs/wire/season-01.md` (human bible) and `convex/seeds/wireSeason01.ts` (typed seed module).
- Implement `seasons.importSeason` and a one-shot `npm`/`pnpm` script that imports it locally.
- Backfill `kind: "scheduled"` on existing `marketNarratives` rows in a small migration.

### Phase 2 — Hourly Wire epoch generation

- Build pure modules: `tradingHours`, `epochAssembler`, `epochValidator`.
- Update the `narrative_generation` system prompt to enforce season tone, entity roster, callback requirement, and the five-role shape.
- Extend `NarrativeEpochSchema` (Zod) to include `role` per headline, `dealSeed`, `arcUpdates`, `entityMentions`.
- Implement `wire.generateNextEpoch` action wiring the modules together.
- Register the `wire-epoch-generator` cron in `convex/crons.ts`.
- Write unit + integration tests.

### Phase 3 — Wire UI updates

- Extend `marketNarratives.feedHeadlines` to surface `kind`, `arcRef`, `referenceEpoch`, deal-seed link.
- Update `WirePost` to render bulletins distinctly, render callbacks with an "↳ EARLIER" link, render deal seeds with the create-deal affordance.
- Update `WireStatsBar` to show top-arc tension if available.
- Verify in-browser on Mac Chrome that the feed reads as a serialized story, not a list.

### Phase 4 — Event-triggered breaking bulletins

- Implement `bulletinTriggers` pure module.
- Add a `narrative_bulletin` system prompt and a tight Zod schema for single-headline output.
- Implement `wire.fireBulletin` action.
- Wire trigger calls into: `dealEntries.recordVerifiedEntry`, `dealOutcomes.create`, `deals.create`, deal-aggregate update site, SEC-heat watcher (post-epoch-write), arc-tension watcher (post-epoch-write).
- Add the `bulletinDedupeKey` index and per-hour rate-limit check.
- Tests.

### Phase 5 — Deal seeds and create-deal flow

- Persist deal seeds during epoch generation (Phase 2 already writes them; this phase polishes the UX).
- Wire the create-deal affordance through `CreateDealDialog`. Prefill prompt / pot / entry from the seed; pass `sourceHeadline`.
- On successful create, write `consumedDealId` onto the seed row.
- Render `[TAKEN]` badge and deal link for consumed seeds.

### Phase 6 — Dev/admin tools and polish

- Implement `wire.devForceEpoch`, `wire.devForceBulletin`, `wire.devListArcs`, `wire.devResetNarrative`.
- Build a minimal `/admin/wire` page gated to operator subjects.
- Add the forbidden-language CI lint (scans recent epochs).
- Editorial pass on tone after 1–2 days of real generation.

---

## Further Notes

- **Existing infra reused:**
  - `marketNarratives` table — extended, not replaced.
  - `NarrativeHeadlineSchema`, `NarrativeEpochSchema`, `WorldStateSchema` — extended in place.
  - `buildNarrativeGenerationMessages`, `callModel`, `systemPrompts` table — reused; prompt content rewritten.
  - `WIRE_SOURCES` source-label map — already covers all current categories; extend only if a new category is introduced.
  - `deals.sourceHeadline` field — already present, used for back-linking deals to the wire.
  - `convex-test` setup under `tests/convex/` — used for both new pure-module and integration tests.

- **No existing narrative cron exists today.** The user's "do not run every 5 minutes" constraint is forward-looking — the proposed cron is the first one, registered as hourly with an in-action trading-hours guard.

- **DST handling:** the trading-hours module must use a real timezone library or `Intl.DateTimeFormat` with `America/New_York`. Hard-coded UTC offsets break twice a year.

- **Holiday handling deferred.** v1 generates on US market holidays. If that produces awkward "trading floor abuzz on Thanksgiving" copy, a holiday calendar can be added in Phase 6 polish.

- **LLM cost envelope (rough):** ~6 epochs × trading day × 5 trading days = 30 scheduled generations per week, plus an estimated 10–30 bulletins. Well under typical OpenAI budget — no batching or caching required for v1.

- **Failure mode:** if generation fails (LLM error, validation error, rate limit), the slot is skipped silently. The next slot retries. Players will see a one-hour gap, which is acceptable; an alarm should fire if 3 consecutive slots fail.

- **Open editorial questions (not blocking):**
  - Should bulletins occasionally include the player's _desk display name_ when it's a notable game event? (Probably yes, behind a flag.)
  - Should the LLM be allowed to introduce **new** minor entities mid-season, or are entities locked to the seed roster? (Recommend locked in v1; relax in v2.)
  - Should arc resolution be authored by the operator or proposed by the LLM? (Recommend operator-only via dev tools in v1.)
