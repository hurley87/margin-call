# Portrait Generation v3 — Spec

Status: Ready to implement
Target metadata version: `PORTRAIT_METADATA_VERSION = 3`

This spec replaces the v2 portrait seed logic in `convex/lib/portraitSeed.ts`,
adjusts `convex/portraits.ts`, expands the public NFT/trader read surface in
`convex/traders.ts` and `src/lib/trader-metadata.ts`, and adds new tests.

It is the canonical reference for the change — code review against this doc.

---

## 1. Goals

1. Eliminate the visual collapse where most portraits look like the same
   "serious male trader, red tie, phone, CRT" archetype.
2. Produce deterministic, collectible-feeling rogue-trader portraits with
   meaningful variety across archetype, gender presentation, age, appearance,
   hairstyle, clothing, props, scene, lighting, expression, and camera.
3. **Guarantee that the generated image never contains text, name, ticker,
   logo, watermark, label, nameplate, UI, crypto imagery, or readable
   document/terminal content.**
4. Keep image generation deterministic: same `(ownerSubject, name, mandate,
personality, PORTRAIT_METADATA_VERSION)` ⇒ same `imagePrompt`,
   `imageStyleSeed`, and trait selection.

---

## 2. Decisions (locked)

| #   | Decision                            | Choice                                                                                               |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Existing v2 portraits               | **Force regenerate everyone** via operator-only backfill action                                      |
| 2   | Public NFT trait exposure           | **Expose all derived traits** as `attributes` on the NFT metadata route                              |
| 3   | `appearanceVariant` prompt phrasing | **Descriptive features** (skin tone + hair/feature cues, no racial labels)                           |
| 4   | Image quality                       | **`quality: "medium"`** at `size: "1024x1024"` on `gpt-image-1-mini`                                 |
| 5   | Archetype label migration           | **Let it change.** New 12-archetype taxonomy replaces the old 8 verbatim                             |
| 6   | Backfill execution                  | **Scheduled trickle**, 1 per 4 s, via operator-only action                                           |
| 7   | Name dictionary scope               | **Small curated** (~40–60 per gender + ~10–20 explicit ambiguous)                                    |
| 8   | Trait coupling                      | **Archetype dictates scene + prop + marketMoment**; other traits independent                         |
| 9   | Hash distribution                   | **Per-trait re-hash**: `stableHash(baseHash + ':' + categoryName)`                                   |
| 10  | Gender taxonomy                     | **Two presentations** (`feminine`, `masculine`); `unknown` falls back to hash                        |
| 11  | UI during regen                     | **Keep v2 image** until new image is stored; do not null `profileImageStorageId`                     |
| 12  | Re-roll capability                  | **None.** Same inputs ⇒ same portrait                                                                |
| 13  | Schema field                        | **Reuse `imageVariant`** field, change value pool to new 12 archetype IDs                            |
| 14  | `apparentAge` granularity           | **4 buckets** with **soft archetype-bias** via `preferredAgeBuckets`                                 |
| 15  | Test location                       | **`tests/convex/portraitSeed.test.ts`** (new), vitest direct, no Convex harness                      |
| 16  | `imageRetryCount` on reseed         | **Reset only on version bump** (v2→v3)                                                               |
| 17  | Prompt format                       | **Multiline sections with bulleted trait lines** (literal `\n`)                                      |
| 18  | "Internal style seed" sentinel      | **Dropped entirely** from `imagePrompt`                                                              |
| 19  | Backfill trigger                    | **Operator-only action** `portraits.adminBackfillV3`                                                 |
| 20  | `imagePromptSource` provenance      | **Include all derived trait values** + `traderName` + mandate/personality snapshots                  |
| 21  | In-app surface                      | **Full trait list on public trader profile/dialog**; archetype + 1 flavor trait on leaderboard cards |

---

## 3. Trait System

### 3.1 Categories and pools

Each pool entry has both an internal id and a prompt-ready description. The
description is what is interpolated into the `imagePrompt`. The id is what is
persisted to `imagePromptSource` and exposed in NFT metadata.

#### `archetype` — 12 entries (scene + prop + marketMoment are coupled here)

| id                        | description (used in prompt)                                                                                                              | scene                                                        | prop                                            | marketMoment                     | preferredAgeBuckets              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- | -------------------------------- | -------------------------------- |
| `mna_rainmaker`           | late-night hostile takeover war room, binders, fax paper, brass desk lamp, calm calculating presence                                      | private deal-room office at midnight, walnut paneling        | open binder of deal docs, brass desk lamp       | mid-deal closing crunch          | `mid_30s`, `mid_40s`             |
| `junk_bond_operator`      | high-yield bond desk strewn with prospectuses, ash in the air, leaning forward over the desk                                              | high-yield bond desk, paper-stacked horizon                  | thick stapled prospectus, half-empty coffee mug | leveraged-buyout euphoria        | `mid_30s`, `mid_40s`             |
| `risk_floor_captain`      | risk supervision pod overlooking a floor of traders, posture upright and watchful                                                         | risk pod overlooking a busy trading floor                    | clipboard with printed risk sheet               | mid-session volatility spike     | `mid_40s`, `late_50s`            |
| `crash_day_survivor`      | chaotic trading floor during a crash, papers in motion, red and green terminal glow, intense expression                                   | chaotic trading floor mid-crash, papers tumbling             | crumpled order tickets in fist                  | black-monday-style crash session | `mid_30s`, `mid_40s`, `late_50s` |
| `commodities_pit_veteran` | noisy commodities pit, light trading jacket, paper order slips, crowded floor of arms and hand signals                                    | open-outcry commodities pit, jackets and hand signals        | bundle of paper order slips                     | heating crude / grains squeeze   | `mid_40s`, `late_50s`            |
| `execution_desk_closer`   | execution desk, order tickets, multiple corded phones in the background, aggressive focused posture                                       | execution desk, banks of corded phones along the wall behind | order ticket pad mid-write                      | block-trade execution rush       | `late_20s`, `mid_30s`, `mid_40s` |
| `macro_crisis_analyst`    | macro research nook with global newspapers, charts, and a small globe, contemplative                                                      | macro research nook, oak desk, world newspapers              | folded Financial Times across the desk          | sovereign-debt crisis briefing   | `mid_30s`, `mid_40s`, `late_50s` |
| `boiler_room_salesman`    | cramped boiler-room sales floor, pitching into a corded phone but phone not necessarily held up to ear, bullpen of identical desks behind | cramped boiler-room bullpen of desks                         | corded phone resting on shoulder                | retail penny-stock pump          | `late_20s`, `mid_30s`            |
| `arbitrage_specialist`    | quiet arbitrage cubicle with two CRTs running abstract glowing market shapes, ruler and pencil notes (text unreadable), focused stare     | quiet arb cubicle, two CRTs side by side                     | mechanical pencil and ruler                     | merger-spread compression        | `late_20s`, `mid_30s`, `mid_40s` |
| `rookie_quant`            | cramped back-office analytics room, oversized 1980s suit, thick glasses, stacked CRT monitors, abstract unreadable notes                  | back-office analytics room, stacked CRTs                     | basic four-function calculator                  | first big intraday rally         | `late_20s`                       |
| `old_school_partner`      | corner partner office, walnut paneling, antique globe, leather chair, posture relaxed and powerful                                        | corner partner office, brass-and-walnut detail               | unlit cigar held casually                       | quiet partner-track afternoon    | `mid_40s`, `late_50s`            |
| `margin_call_escapee`     | dark office after a catastrophic trade, loosened tie, red warning glow, scattered papers, exhausted expression                            | dark office post-blowup, single overhead lamp, red glow      | scattered crumpled paper, tie pulled loose      | post-margin-call wreckage        | `mid_30s`, `mid_40s`, `late_50s` |

> The archetype `description` field is what flows into the prompt's
> `Archetype:` line. `scene`, `prop`, and `marketMoment` flow into their
> respective lines. All other categories below are sampled independently
> from the archetype.

#### `expression` — 8 entries

`calm_calculating`, `sharp_focused`, `tense_alert`, `worn_exhausted`,
`confident_smirk`, `predatory_grin`, `bewildered_overwhelmed`, `cold_detached`.

Prompt phrasings: "calm calculating expression", "sharp focused gaze",
"tense alert posture", "worn exhausted look", "confident smirk",
"predatory grin", "bewildered overwhelmed look", "cold detached stare".

#### `lighting` — 6 entries

`amber_desk_lamp` ("warm amber desk-lamp pool"),
`green_crt_glow` ("green CRT terminal glow on one side of face"),
`overhead_fluorescent` ("flat overhead fluorescent office light"),
`red_warning_glow` ("low red warning-light glow"),
`window_dawn` ("cool blue pre-dawn window light"),
`high_contrast_noir` ("hard cinematic noir key light, deep shadows").

#### `cameraAngle` — 5 entries

`head_and_shoulders_centered` ("head-and-shoulders, centered, eyes to camera"),
`three_quarter_left` ("three-quarter angle from camera left"),
`three_quarter_right` ("three-quarter angle from camera right"),
`slight_low_angle` ("slight low angle, heroic framing"),
`slight_high_angle` ("slight high angle, watchful framing").

> All angles must still resolve to a square crop with the subject's upper
> body or head-and-shoulders filling the frame.

#### `genderPresentation` — 2 entries

`feminine` ("woman, feminine presentation"),
`masculine` ("man, masculine presentation").

Selection rules (see §4):

1. If `inferGenderPresentationFromName(name)` returns `feminine` or
   `masculine`, use it directly.
2. If it returns `unknown`, deterministically pick `feminine` or `masculine`
   from `subHash("genderPresentation")` mod 2.

#### `apparentAge` — 4 buckets

`late_20s` ("late 20s"), `mid_30s` ("mid 30s"), `mid_40s` ("mid 40s"),
`late_50s` ("late 50s").

Selection rule: filter the full pool down to the archetype's
`preferredAgeBuckets` array, then take `subHash("apparentAge") % filtered.length`.
This produces soft coherence (a `rookie_quant` is always late-20s, an
`old_school_partner` is mid-40s or late-50s) while preserving determinism.

#### `appearanceVariant` — 12 entries (descriptive features only — no racial labels)

Each entry is a single short descriptive clause. Drawn independently from
gender presentation; the model handles gendering naturally.

1. "pale fair skin, freckled, light-blond hair"
2. "fair skin, auburn hair with subtle waves"
3. "fair skin, dark-brown hair, sharp brows"
4. "olive-toned skin, dark wavy hair"
5. "warm-tan skin, jet-black straight hair"
6. "medium-brown skin, dark coiled hair"
7. "deep-brown skin, short tightly-coiled hair"
8. "deep-brown skin, longer twisted-coiled hair"
9. "light-tan skin, almond eyes, sleek black hair"
10. "medium-tan skin, almond eyes, dark hair pulled back"
11. "ruddy fair skin, salt-and-pepper hair"
12. "deep-tan skin, dark hair with a few silver streaks"

#### `hairstyle` — 10 entries

`short_business_cut`, `slicked_back`, `feathered_layered`, `power_perm`,
`tight_chignon`, `voluminous_blowout`, `pulled_back_low_pony`,
`side_part_classic`, `cropped_natural_coil`, `buzz_cut`.

Prompt phrasings:
"short business cut", "slicked-back hair", "feathered layered 80s hair",
"power perm", "tight low chignon", "voluminous 80s blowout",
"hair pulled back in a low ponytail", "classic side part",
"cropped natural coils", "buzz cut".

> The selected hairstyle is paired naturally by the model with the appearance
> variant; the prompt does not enforce a mapping table — keep it flexible.

#### `clothingStyle` — 10 entries

`pinstripe_double_breasted` ("pinstripe double-breasted suit, broad shoulders"),
`charcoal_three_piece` ("charcoal three-piece suit, vest visible"),
`navy_power_suit` ("navy power suit, structured shoulders"),
`tan_summer_suit` ("tan summer-weight suit, sleeves slightly pushed"),
`shirt_sleeves_braces` ("white dress shirt, leather braces, tie loosened"),
`burgundy_blazer_silk` ("burgundy blazer over a silk shell"),
`grey_skirt_suit` ("grey 80s skirt suit with sharp lapels"),
`black_dress_blazer` ("black sheath dress under a long-line blazer"),
`commodities_trading_jacket` ("brightly colored open-outcry trading jacket"),
`rumpled_oxford_no_tie` ("rumpled oxford shirt, no tie, top button open").

#### `accessory` — 10 entries

`tortoiseshell_glasses` ("tortoiseshell glasses"),
`aviator_glasses` ("aviator-frame glasses"),
`gold_signet_ring` ("gold signet ring on pinky"),
`chunky_gold_watch` ("chunky gold wristwatch"),
`pearl_studs` ("small pearl stud earrings"),
`silk_pocket_square` ("paisley silk pocket square"),
`bold_red_lip` ("bold red lipstick"),
`gold_chain_thin` ("thin gold chain visible at collar"),
`silk_scarf_neck` ("silk scarf knotted at the neck"),
`no_accessory` ("no notable accessory").

> The prompt should be free to skip accessories where they would clash with
> the archetype (e.g. commodities pit + pearl earrings is fine; the model
> handles it). No hard exclusions.

### 3.2 Independence summary

- **Archetype-coupled** (selected from archetype's fixed mapping):
  `scene`, `prop`, `marketMoment`.
- **Archetype-biased**: `apparentAge` (filtered by `preferredAgeBuckets`).
- **Fully independent** (own sub-hash per category):
  `expression`, `lighting`, `cameraAngle`, `genderPresentation`,
  `appearanceVariant`, `hairstyle`, `clothingStyle`, `accessory`.

---

## 4. Deterministic Selection Algorithm

```ts
// pseudocode — pure functions, no Convex deps

const PORTRAIT_METADATA_VERSION = 3;

function stableHash(input: string): number {
  /* unchanged FNV-1a 32-bit */
}

function subHash(baseHash: number, category: string): number {
  return stableHash(`${baseHash.toString(36)}:${category}`);
}

function pickFrom<T>(pool: readonly T[], hash: number): T {
  return pool[hash % pool.length];
}

export function buildPortraitSeed(args: {
  ownerSubject: string;
  name: string;
  mandate: unknown;
  personality?: string;
}) {
  const baseHash = stableHash(
    JSON.stringify({
      ownerSubject: args.ownerSubject,
      name: args.name,
      mandate: args.mandate ?? {},
      personality: args.personality ?? "",
      version: PORTRAIT_METADATA_VERSION,
    })
  );

  // 1. Archetype dictates scene/prop/marketMoment.
  const archetype = pickFrom(ARCHETYPES, subHash(baseHash, "archetype"));

  // 2. apparentAge filtered to archetype's preferredAgeBuckets.
  const ageOptions = APPARENT_AGE.filter((a) =>
    archetype.preferredAgeBuckets.includes(a.id)
  );
  const apparentAge = pickFrom(ageOptions, subHash(baseHash, "apparentAge"));

  // 3. genderPresentation: name inference, hash fallback.
  const inferred = inferGenderPresentationFromName(args.name); // 'feminine' | 'masculine' | 'unknown'
  const genderHash = subHash(baseHash, "genderPresentation");
  const genderPresentation =
    inferred === "unknown"
      ? GENDER_PRESENTATIONS[genderHash % 2]
      : GENDER_PRESENTATIONS.find((g) => g.id === inferred)!;
  const genderPresentationSource =
    inferred === "feminine"
      ? "inferred-feminine"
      : inferred === "masculine"
        ? "inferred-masculine"
        : "hashed";

  // 4. Remaining independent traits.
  const expression = pickFrom(EXPRESSIONS, subHash(baseHash, "expression"));
  const lighting = pickFrom(LIGHTING, subHash(baseHash, "lighting"));
  const cameraAngle = pickFrom(CAMERA_ANGLES, subHash(baseHash, "cameraAngle"));
  const appearanceVariant = pickFrom(
    APPEARANCE_VARIANTS,
    subHash(baseHash, "appearanceVariant")
  );
  const hairstyle = pickFrom(HAIRSTYLES, subHash(baseHash, "hairstyle"));
  const clothingStyle = pickFrom(
    CLOTHING_STYLES,
    subHash(baseHash, "clothingStyle")
  );
  const accessory = pickFrom(ACCESSORIES, subHash(baseHash, "accessory"));

  const imageStyleSeed = `portrait-v${PORTRAIT_METADATA_VERSION}-${baseHash.toString(36)}`;
  const imagePrompt = composePrompt({
    archetype,
    expression,
    lighting,
    marketMoment: archetype.marketMoment,
    cameraAngle,
    genderPresentation,
    apparentAge,
    appearanceVariant,
    hairstyle,
    clothingStyle,
    accessory,
  });

  return {
    imageStatus: "pending" as const,
    imagePrompt,
    imagePromptSource: {
      version: PORTRAIT_METADATA_VERSION,
      traderName: args.name, // internal provenance only
      mandateSnapshot: args.mandate ?? {},
      personalitySnapshot: args.personality ?? null,
      genderPresentationSource,
      traits: {
        archetype: archetype.id,
        scene: archetype.scene,
        prop: archetype.prop,
        marketMoment: archetype.marketMoment,
        expression: expression.id,
        lighting: lighting.id,
        cameraAngle: cameraAngle.id,
        genderPresentation: genderPresentation.id,
        apparentAge: apparentAge.id,
        appearanceVariant: appearanceVariant.id,
        hairstyle: hairstyle.id,
        clothingStyle: clothingStyle.id,
        accessory: accessory.id,
      },
    },
    imageStyleSeed,
    imageVariant: archetype.id, // reuse existing field; new 12-value enum
    imageRetryCount: 0, // explicit reset — see §6.3 for migration semantics
    metadataVersion: PORTRAIT_METADATA_VERSION,
  };
}
```

### 4.1 `inferGenderPresentationFromName(name)`

```ts
const FEMININE_NAMES = new Set([
  // ~40-60 unambiguous, lowercase
  "hayley",
  "hailey",
  "haylee",
  "sarah",
  "sara",
  "emily",
  "emma",
  "jessica",
  "amanda",
  "olivia",
  "michelle",
  "rachel",
  "laura",
  "jennifer",
  "amy",
  "stephanie",
  "nicole",
  "elizabeth",
  "megan",
  "ashley",
  "brittany",
  "heather",
  "christina",
  "kimberly",
  "rebecca",
  "kelly",
  "tiffany",
  "danielle",
  "melissa",
  "lauren",
  "katherine",
  "kate",
  "katie",
  "catherine",
  "caroline",
  "claire",
  "sophie",
  "sophia",
  "ava",
  "isabella",
  "mia",
  "abigail",
  "grace",
  "ella",
  "chloe",
  "lily",
  "zoe",
  "hannah",
  "natalie",
  "victoria",
  "julia",
  "anna",
  "maria",
  "diane",
  "linda",
  "barbara",
  "susan",
  "karen",
  "nancy",
  "betty",
]);

const MASCULINE_NAMES = new Set([
  "david",
  "michael",
  "mike",
  "marcus",
  "james",
  "jim",
  "robert",
  "rob",
  "anthony",
  "tony",
  "thomas",
  "tom",
  "john",
  "daniel",
  "dan",
  "matthew",
  "matt",
  "christopher",
  "chris",
  "andrew",
  "andy",
  "joshua",
  "josh",
  "ryan",
  "brandon",
  "jason",
  "justin",
  "william",
  "will",
  "liam",
  "noah",
  "ethan",
  "mason",
  "logan",
  "lucas",
  "jackson",
  "henry",
  "sebastian",
  "jacob",
  "jack",
  "aiden",
  "owen",
  "benjamin",
  "ben",
  "samuel",
  "joseph",
  "joe",
  "kevin",
  "brian",
  "steven",
  "steve",
  "timothy",
  "tim",
  "richard",
  "rick",
  "george",
  "frank",
  "peter",
  "paul",
  "mark",
  "scott",
  "gary",
  "gregory",
  "edward",
  "ed",
  "charles",
  "charlie",
  "donald",
  "ronald",
  "kenneth",
  "ken",
]);

const EXPLICIT_AMBIGUOUS = new Set([
  "jordan",
  "taylor",
  "morgan",
  "casey",
  "alex",
  "sam",
  "pat",
  "jamie",
  "riley",
  "avery",
  "cameron",
  "skyler",
  "quinn",
  "dakota",
  "reese",
  "rowan",
  "blake",
  "drew",
  "kai",
  "sage",
]);

export function inferGenderPresentationFromName(
  name: string
): "feminine" | "masculine" | "unknown" {
  if (!name) return "unknown";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) return "unknown";
  if (EXPLICIT_AMBIGUOUS.has(first)) return "unknown";
  if (FEMININE_NAMES.has(first)) return "feminine";
  if (MASCULINE_NAMES.has(first)) return "masculine";
  return "unknown";
}
```

Properties asserted by tests:

- `inferGenderPresentationFromName("Hayley")` → `"feminine"`
- `inferGenderPresentationFromName("Hayley Patel")` → `"feminine"` (first token only)
- `inferGenderPresentationFromName("Jordan")` → `"unknown"`
- `inferGenderPresentationFromName("DAVID")` → `"masculine"` (case-insensitive)
- `inferGenderPresentationFromName("")` → `"unknown"`
- `inferGenderPresentationFromName("Zxqwer")` → `"unknown"`

This is **art direction only**. It is never used as an identity claim,
never surfaced to the user as "we think your name is feminine," and never
overrides any user input that doesn't exist today.

---

## 5. Prompt Composition

### 5.1 Template

`composePrompt(traits)` returns a single string assembled from these
sections, joined by literal `\n\n` between sections and `\n` between lines
within a section.

```
Create a square profile-picture portrait of one fictional 1987 Wall Street trader for a competitive AI trading game called Margin Call. The portrait should feel like a collectible rogue-trader character NFT, not a corporate headshot.

Character traits:
- Gender presentation: {genderPresentation.prompt}
- Apparent age: {apparentAge.prompt}
- Visual appearance: {appearanceVariant.prompt}
- Hairstyle: {hairstyle.prompt}
- Clothing: {clothingStyle.prompt}
- Accessory: {accessory.prompt}

Scene:
- Archetype: {archetype.description}
- Setting: {archetype.scene}
- Main prop: {archetype.prop}
- Expression: {expression.prompt}
- Lighting: {lighting.prompt}
- Market moment: {archetype.marketMoment}
- Camera angle: {cameraAngle.prompt}

Style:
High-end retro game character art, painterly pixel-art inspired, cinematic 1980s financial thriller, dramatic amber and green CRT lighting, gritty scanline texture, detailed face, distinct silhouette, square crop, upper-body or head-and-shoulders composition.

Strict exclusions:
No readable text anywhere. No captions. No name. No nameplate. No labels. No job titles. No ticker symbols. No numbers. No letters. No logos. No watermarks. No UI text. No readable documents. No readable terminal text. No readable screen text. No modern devices. No cryptocurrency imagery. No border.

The trader's name and internal seed must not appear visually in the image.
```

### 5.2 Hard guarantees

- **The trader's `name` field is never substituted into the prompt body.**
  It is only used as a deterministic seed input (inside `stableHash` and
  inside `inferGenderPresentationFromName`).
- The strings "named", "called", "his name is", "her name is", "trader name",
  and the trader's actual `name` value must not appear anywhere in
  `imagePrompt`.
- The strict-exclusions block is always emitted verbatim.
- The closing safety sentence is always emitted verbatim.

These are enforced by the tests in §8.

### 5.3 Removed in v3

- The old `BASE_PORTRAIT_PROMPT` constant.
- The old `IMAGE_VARIANT_DESCRIPTIONS` map and `IMAGE_VARIANTS` array.
- The old appended sentinel `"Internal style seed {seed}; do not render the
seed, trader name, role, or variation as text."` — entirely dropped. The
  seed is provenance, not content.

---

## 6. Convex Changes

### 6.1 `convex/lib/portraitSeed.ts`

- Bump `PORTRAIT_METADATA_VERSION` from `2` to `3`.
- Keep `stableHash` and `getPortraitPromptVersion` exports unchanged.
- Add `subHash`, `pickFrom`, `inferGenderPresentationFromName`.
- Export typed trait pool constants (`ARCHETYPES`, `EXPRESSIONS`, etc.) so
  tests can introspect.
- Export `composePrompt(traits)` for direct unit testing.
- Rewrite `buildPortraitSeed` per §4.

### 6.2 `convex/portraits.ts`

- Change the OpenAI call:
  ```ts
  await client.images.generate(
    {
      model: "gpt-image-1-mini",
      prompt,
      size: "1024x1024",
      quality: "medium", // bumped from "low"
      output_format: "png",
      n: 1,
    },
    { timeout: 90_000 }
  );
  ```
- Replace the legacy fallback prompt
  `Create a square profile picture of a fictional 1987 Wall Street trader named ${trader.name}. No text, no logos.`
  with a generic strict-no-text fallback that **does not include
  `trader.name`**:
  ```ts
  const FALLBACK_PROMPT =
    "Create a square profile-picture portrait of one fictional 1987 Wall Street trader for a retro trading game. Painterly pixel-art inspired, cinematic 1980s financial thriller, detailed face, head-and-shoulders or upper-body composition. No readable text anywhere. No captions, no name, no nameplate, no labels, no job titles, no ticker symbols, no numbers, no letters, no logos, no watermarks, no UI text, no readable documents, no readable terminal text, no readable screen text, no modern devices, no cryptocurrency imagery, no border.";
  const prompt = trader.imagePrompt ?? FALLBACK_PROMPT;
  ```
- Add new operator-only action `adminBackfillV3` (see §7).
- Keep `generateForTrader`, `applyPortraitReady`, `applyPortraitError`
  semantics otherwise unchanged.

### 6.3 `convex/traders.ts`

- `markPortraitGenerating` already re-seeds when
  `getPortraitPromptVersion(...) < PORTRAIT_METADATA_VERSION`. **Critical
  change:** when re-seeding for a version bump, **do not null
  `profileImageStorageId`**. The patch object should not include
  `profileImageStorageId` at all — the existing v2 image stays visible until
  `applyPortraitReady` swaps it. (Today's code does not null it; just
  confirm in the diff that this remains true.)
- Reset `imageRetryCount` to `0` only when re-seeding for a version bump
  (this is what `buildPortraitSeed` returns, and the spread keeps it).
- Extend `publicTraderBasics` to add a `traits` field containing the
  derived trait values when available:
  ```ts
  return {
    traderId: trader._id,
    name: trader.name,
    status: trader.status,
    portraitStatus: trader.imageStatus ?? "pending",
    archetype: humanizeImageVariant(trader.imageVariant),
    riskProfile: deriveRiskProfile(trader.mandate),
    tokenId: trader.tokenId ?? null,
    profileImageUrl: await resolveReadyProfileImageUrl(ctx, trader),
    traits: readPublicTraits(trader.imagePromptSource), // null if v2 or unset
  };
  ```
  where `readPublicTraits` reads `imagePromptSource.traits` and returns only
  the trait id fields — never `traderName`, `mandateSnapshot`,
  `personalitySnapshot`, `genderPresentationSource`, or the raw hash.
- Update `humanizeImageVariant` to humanize the new 12 IDs identically
  (it already does — it just splits underscores and Title Cases). Add a
  small label map override for IDs whose underscore-humanization reads
  awkwardly:
  | id | display |
  |---|---|
  | `mna_rainmaker` | "M&A Rainmaker" |
  | `commodities_pit_veteran` | "Commodities Pit Veteran" |
  | `risk_floor_captain` | "Risk Floor Captain" |
  | `crash_day_survivor` | "Crash Day Survivor" |
  | `execution_desk_closer` | "Execution Desk Closer" |
  | `macro_crisis_analyst` | "Macro Crisis Analyst" |
  | `boiler_room_salesman` | "Boiler Room Salesman" |
  | `arbitrage_specialist` | "Arbitrage Specialist" |
  | `rookie_quant` | "Rookie Quant" |
  | `old_school_partner` | "Old-School Partner" |
  | `margin_call_escapee` | "Margin Call Escapee" |
  | `junk_bond_operator` | "Junk Bond Operator" |
- `toTraderReadModel` (owner-only read model): expose the same `traits`
  object to the owner. Do **not** expose `imagePrompt`,
  `imagePromptSource`, `genderPresentationSource`, `imageStyleSeed`, or
  `mandateSnapshot` here — only the `traits` map.

### 6.4 Schema (`convex/schema.ts`)

No schema migration required.

- `imageVariant` stays `v.string()` (it already is, in practice — the union
  is informational, not enforced).
- If the field is declared as a union of the old 8 values, widen it to
  `v.string()` (or to a union including the new 12). Confirm during
  implementation.
- `imagePromptSource` stays `v.any()` (or whatever opaque shape it currently
  uses).

---

## 7. v3 Backfill Action

### 7.1 Behavior

```ts
// convex/portraits.ts (continued)
export const adminBackfillV3 = action({
  args: { delayMsBetween: v.optional(v.number()) },
  handler: async (ctx, { delayMsBetween }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertOperatorSubject(identity.subject);

    const stale = await ctx.runQuery(
      internal.traders.listStaleForPortraitV3,
      {}
    );
    const stagger = delayMsBetween ?? 4000;

    let scheduled = 0;
    for (const traderId of stale) {
      await ctx.scheduler.runAfter(
        scheduled * stagger,
        internal.portraits.generateForTrader,
        { traderId, force: true }
      );
      scheduled += 1;
    }
    return { ok: true as const, scheduled };
  },
});
```

### 7.2 Supporting internal query

Add `internal.traders.listStaleForPortraitV3`:

```ts
export const listStaleForPortraitV3 = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("traders").collect();
    return all
      .filter(
        (t) =>
          getPortraitPromptVersion(t.imagePromptSource) <
          PORTRAIT_METADATA_VERSION
      )
      .map((t) => t._id);
  },
});
```

### 7.3 Properties

- **Operator-only.** Gated by `assertOperatorSubject(identity.subject)`.
- **Idempotent on rerun.** Re-running it after partial completion only
  schedules the remaining stale traders — once `markPortraitGenerating`
  upgrades a trader to v3 and `applyPortraitReady` lands the new image,
  `imagePromptSource.version` is 3 and it no longer matches the filter.
  (Re-running mid-flight may double-schedule a trader currently in flight;
  `markPortraitGenerating` early-returns when `imageStatus === "generating"`,
  so this is safe.)
- **Trickle:** Default 4 s between scheduled generations. Operator can
  pass `delayMsBetween` to tune.
- **Scope:** All traders with stale prompt version regardless of status —
  active, paused, and wiped-out alike.
- **No UI blackout:** Because we don't null `profileImageStorageId` on
  re-seed, every trader keeps its v2 image visible until its new v3 image
  lands.

---

## 8. Tests

### 8.1 New: `tests/convex/portraitSeed.test.ts`

Vitest direct (no Convex test harness). Imports
`../../convex/lib/portraitSeed`.

```ts
import { describe, it, expect } from "vitest";
import {
  buildPortraitSeed,
  inferGenderPresentationFromName,
  PORTRAIT_METADATA_VERSION,
  ARCHETYPES,
} from "../../convex/lib/portraitSeed";
```

Required cases (all 8 from the brief + 2 extras agreed in interview):

1. **Determinism.** Same `(ownerSubject, name, mandate, personality)` ⇒
   identical `imagePrompt`, `imageStyleSeed`, `imageVariant`,
   `imagePromptSource.traits`.
2. **Name diversity.** Build seeds for 50 distinct names (same owner,
   mandate, personality). Assert at least 8 distinct archetype values,
   at least 5 distinct appearanceVariants, at least 4 distinct
   clothingStyles appear across the sample.
3. **Feminine name inference.** Both `buildPortraitSeed({...name:"Hayley"})`
   and `buildPortraitSeed({...name:"Hailey"})` yield
   `imagePromptSource.traits.genderPresentation === "feminine"` and
   `imagePromptSource.genderPresentationSource === "inferred-feminine"`.
4. **Ambiguous name fallback.** `name:"Jordan"` ⇒
   `genderPresentationSource === "hashed"` and resulting presentation is
   one of `"feminine" | "masculine"`. Changing the ownerSubject changes
   the hashed pick deterministically.
5. **No raw name in prompt.** For 20 random first names including
   "Hayley", "David", "Marcus", "Olivia", `imagePrompt.toLowerCase()`
   must not contain the lowercase first name as a whole word. Assert
   regex `/\\b<name>\\b/i.test(imagePrompt) === false` for each.
6. **Strict exclusions present.** `imagePrompt` contains all of:
   "no readable text", "no captions", "no name", "no nameplate",
   "no labels", "no job titles", "no ticker symbols", "no numbers",
   "no letters", "no logos", "no watermarks", "no ui text",
   "no readable documents", "no readable terminal text",
   "no readable screen text", "no modern devices",
   "no cryptocurrency imagery", "no border", and the final safety
   sentence "the trader's name and internal seed must not appear visually
   in the image."
7. **Provenance includes derived traits.** `imagePromptSource` includes
   `version === 3`, `traderName`, `mandateSnapshot`,
   `personalitySnapshot`, `genderPresentationSource`, and a `traits`
   object with all 13 expected keys (`archetype`, `scene`, `prop`,
   `marketMoment`, `expression`, `lighting`, `cameraAngle`,
   `genderPresentation`, `apparentAge`, `appearanceVariant`,
   `hairstyle`, `clothingStyle`, `accessory`).
8. **Public exposure leakage.** Smoke test that constructs a
   `publicTraderBasics`-equivalent shape (using the exported
   `readPublicTraits` helper) from a `buildPortraitSeed` output and
   asserts the public shape does **not** include `traderName`,
   `mandateSnapshot`, `personalitySnapshot`, `genderPresentationSource`,
   `imagePrompt`, or `imageStyleSeed`. It **does** include the `traits`
   map.
9. **Distribution sanity (200 names).** Generate 200 deterministic
   `(owner, name)` pairs. Every archetype appears at least once; no
   single archetype exceeds 25% of the sample (4× expected uniform =
   ~33% upper bound, 25% guards against the worst mod-bias regression).
10. **Gender dictionary table.** Table-driven assertion over ~20 known
    feminine, ~20 known masculine, ~10 known ambiguous, and ~5 unknown
    names. Includes case-insensitivity ("DAVID" ⇒ masculine) and
    multi-word handling ("Hayley Patel" ⇒ feminine).

### 8.2 Update: `src/lib/__tests__/trader-metadata.test.ts`

The existing test asserts a specific archetype string. Update it to:

- Use one of the new humanized archetype names (e.g. "Junk Bond Operator"
  is still in the new set — likely lowest-touch).
- Add a new case covering "M&A Rainmaker" to lock the special-case
  humanization.
- If the test asserts the full `attributes` array, extend it to include
  any new trait_types (see §9). Otherwise leave that to a new test.

### 8.3 No new Convex-harness test needed

`adminBackfillV3` is a thin scheduler — its correctness is covered by:

- Unit tests on `getPortraitPromptVersion` and `buildPortraitSeed` (above).
- The existing `markPortraitGenerating` semantics, which already have
  test coverage and gate on `promptVersion < PORTRAIT_METADATA_VERSION`.

If adding harness coverage is cheap, add a single integration test that
calls `adminBackfillV3` with two v2-fixture traders and asserts both
get scheduled. This is a stretch goal, not a blocker.

---

## 9. NFT Metadata Surface

### 9.1 `src/lib/trader-metadata.ts`

Extend `buildTraderNftMetadata` so `attributes` includes every trait when
the trader's public read model has a populated `traits` object. Keep the
existing `Archetype` and `Risk Profile` attributes for backward
compatibility with collectors.

```ts
const baseAttributes = [
  { trait_type: "Archetype", value: trader.archetype },
  { trait_type: "Risk Profile", value: trader.riskProfile },
];

const traitAttributes = trader.traits
  ? [
      {
        trait_type: "Gender Presentation",
        value: humanizeId(trader.traits.genderPresentation),
      },
      {
        trait_type: "Apparent Age",
        value: humanizeId(trader.traits.apparentAge),
      },
      {
        trait_type: "Appearance",
        value: humanizeId(trader.traits.appearanceVariant),
      },
      { trait_type: "Hairstyle", value: humanizeId(trader.traits.hairstyle) },
      {
        trait_type: "Clothing",
        value: humanizeId(trader.traits.clothingStyle),
      },
      { trait_type: "Accessory", value: humanizeId(trader.traits.accessory) },
      { trait_type: "Expression", value: humanizeId(trader.traits.expression) },
      { trait_type: "Lighting", value: humanizeId(trader.traits.lighting) },
      { trait_type: "Camera", value: humanizeId(trader.traits.cameraAngle) },
      {
        trait_type: "Market Moment",
        value: humanizeId(trader.traits.marketMoment),
      },
      // scene/prop intentionally omitted from attributes — they're descriptive
      // sentences, not categorical traits, and would clutter the attribute table.
    ]
  : [];

return { ...rest, attributes: [...baseAttributes, ...traitAttributes] };
```

`humanizeId` is a small helper that does what `humanizeImageVariant`
does — split on `_`, Title Case — and applies any explicit display
overrides.

### 9.2 In-app surfaces

- **Public trader profile page** (`src/app/traders/[traderId]/page.tsx`)
  and **PublicTraderDialog** (`src/components/public-trader-dialog.tsx`):
  add a "Traits" section listing each derived trait as a `<DatumCell>` /
  `<ProfileDatum>` row when `trader.traits` is present.
- **Leaderboard / discovery cards:** show one additional flavorful trait
  below the archetype. Pick `accessory` if present and not
  `no_accessory`, else `marketMoment`. Keep the card visually compact.

### 9.3 Never exposed publicly

- `imagePrompt` — internal.
- `imagePromptSource` raw — internal.
- `imageStyleSeed` — internal.
- `imagePromptSource.traderName` — redundant with `name`, but treated as
  internal provenance only.
- `imagePromptSource.genderPresentationSource` — name-inference audit data.
- `imagePromptSource.mandateSnapshot` / `personalitySnapshot` — internal
  reproducibility data.

Public exposes only `imagePromptSource.traits.*`, via the curated
`readPublicTraits` projection.

---

## 10. Non-Goals

- No user-facing portrait customization UI.
- No owner-facing re-roll button. Same inputs ⇒ same portrait.
- No wallet, escrow, or game-mechanics changes.
- No change to image storage (Convex Storage) or to
  `applyPortraitReady` / `applyPortraitError` semantics.
- No moderation/OCR pass on the returned image. The strict-exclusion
  prompt is our only text-suppression mechanism; the model occasionally
  ignores it and that's accepted in this iteration.
- No change to `generateForTrader`'s retry budget logic outside the v2→v3
  reset.

---

## 11. Rollout

1. Land the PR with portraitSeed v3, prompt template, fallback prompt
   change, `quality: "medium"` bump, expanded read models, NFT metadata
   attributes, and `adminBackfillV3`.
2. Deploy.
3. Operator calls `portraits.adminBackfillV3` once. With 4 s spacing,
   N=200 traders finishes in ~13 minutes. N=1000 finishes in ~67 minutes.
4. Monitor `imageError` counts on traders. Re-call `adminBackfillV3` to
   reschedule any that errored — it's idempotent on success.
5. Once 100% of live traders report `imagePromptSource.version === 3`,
   the backfill is complete.

---

## 12. PR Checklist

- [ ] `PORTRAIT_METADATA_VERSION` bumped to `3`.
- [ ] All 13 trait pools defined with stable ids and prompt strings.
- [ ] `inferGenderPresentationFromName` covers feminine, masculine, and
      explicit-ambiguous sets; case-insensitive; first-token-only.
- [ ] `buildPortraitSeed` uses per-trait `subHash` selection.
- [ ] `imagePrompt` never contains the trader's `name`.
- [ ] `imagePrompt` contains the full strict-exclusions block and the
      closing safety sentence verbatim.
- [ ] `imagePromptSource.traits` contains all 13 expected keys.
- [ ] Old `BASE_PORTRAIT_PROMPT`, `IMAGE_VARIANTS`,
      `IMAGE_VARIANT_DESCRIPTIONS`, and the "Internal style seed" sentinel
      are removed.
- [ ] `portraits.ts` uses `quality: "medium"`; fallback prompt does not
      include `trader.name`.
- [ ] `markPortraitGenerating` does not null `profileImageStorageId` when
      re-seeding for a version bump (visual continuity during v3 backfill).
- [ ] `publicTraderBasics` and `toTraderReadModel` expose `traits` only
      through `readPublicTraits` (never raw `imagePromptSource`).
- [ ] `humanizeImageVariant` handles the new 12 archetype ids, with
      explicit override for `mna_rainmaker` → "M&A Rainmaker" etc.
- [ ] NFT metadata attributes expanded per §9.1.
- [ ] Public trader page + dialog render the new `traits` block.
- [ ] Leaderboard/discovery cards render one extra flavor trait.
- [ ] `adminBackfillV3` action exists, operator-gated, trickle-paced.
- [ ] New `tests/convex/portraitSeed.test.ts` covers all 10 cases in §8.1.
- [ ] `src/lib/__tests__/trader-metadata.test.ts` updated for new
      archetype labels and new attribute traits.
- [ ] `pnpm lint` and `pnpm test` pass.
