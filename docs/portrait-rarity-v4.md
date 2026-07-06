# Margin Call — Portrait Rarity (v4)

> ⚠️ **Weights are PERMANENT post-launch.** Rarity is baked into `tokenURI` at mint
> and published as designed odds; it cannot be changed after the collection opens.
> These numbers ship as-is. Editing a weight, reordering a pool, or renaming a value
> after launch breaks the published odds and the determinism guarantee.

Art direction: **two-ink screenprint noir** (Saul Bass silkscreen — cream `#EFE6D0`,
black `#17140F`, one accent ink). Pipeline: a random seed is minted per trader at
creation, stored on the row, and all traits derive deterministically from it
(`convex/lib/portraitSeed.ts`). Same seed → same traits → same prompt, forever. The
prompt is rendered once by `gpt-image-1` (quality high) with no reference/edit
conditioning, then verified (flat border + rare/legendary trait visibility) and
regenerated up to 3× before it can ship.

Sources of truth: `review5.html` (locked style + pinned hex), `review6.html`
(approved weights/tiers/odds), `review7.html` (the four Phase-2 redesigned values +
the hardened no-text clause).

## Surfaced trait slots (the only attributes in `tokenURI`)

Each slot's weights sum to 100. **Rarity tier of a mint = the highest tier across
the five slots.** The metadata `attributes` array carries the 5 slots (each with its
tier + designed odds), plus overall **Rarity** and **Token ID** — nothing else.

### 1 · Expression

| Value           | Weight | Tier     |
| --------------- | -----: | -------- |
| Cold Detached   |  32.6% | Common   |
| Sharp Focused   |  26.2% | Common   |
| Tense Alert     |  22.0% | Common   |
| Predatory Grin  |  12.0% | Uncommon |
| Confident Smirk |   6.5% | Uncommon |
| Manic Laugh     |   0.7% | Rare     |

### 2 · Field Ink (background + accent)

| Value               | Weight | Tier      |
| ------------------- | -----: | --------- |
| Vermilion `#DD3B1C` | 24.75% | Common    |
| Cobalt `#2A4BD0`    | 24.75% | Common    |
| Ochre `#C89012`     | 24.75% | Common    |
| Teal `#147A6E`      | 24.75% | Common    |
| Burnished Silver    |   0.5% | Rare      |
| Gold Leaf           |   0.5% | Legendary |

### 3 · Attire

| Value                    | Weight | Tier     |
| ------------------------ | -----: | -------- |
| Business Suit            |  42.0% | Common   |
| Shirt-sleeves & Braces   |  20.0% | Common   |
| Trading Jacket           |  16.0% | Common   |
| Fur-Collar Overcoat      |  11.0% | Uncommon |
| Tuxedo                   |  10.0% | Uncommon |
| Gold-Threaded Power Suit |   1.0% | Rare     |

### 4 · Vice / Prop (legendaries break the no-prop rule)

| Value             | Weight | Tier      |
| ----------------- | -----: | --------- |
| None              |  79.9% | Common    |
| Unlit Cigarette   |  11.0% | Uncommon  |
| Cigar             |   7.0% | Uncommon  |
| Lit Cigar         |   1.0% | Rare      |
| Martini           |   0.6% | Rare      |
| Cigarette Bouquet |   0.3% | Legendary |
| Champagne Coupe   |   0.2% | Legendary |

### 5 · Field Flourish (worked into the flat field)

| Value             | Weight | Tier      |
| ----------------- | -----: | --------- |
| Plain Field       |  85.4% | Common    |
| Halftone Dot Wash |  12.0% | Uncommon  |
| Bold Ticker Bands |   1.6% | Rare      |
| Confetti Storm    |   1.0% | Legendary |

## Seed-only inputs (NOT surfaced in metadata)

These shape the face and drive the ink-mapping rule, but are **never** emitted as
attributes and never leak through any read model (`readPublicTraits` returns only
the 5 surfaced keys; the demographic is stored on a sibling key).

| Input               | Values (weights)                                    |
| ------------------- | --------------------------------------------------- |
| Skin                | Fair 40 · Mid 40 · Deep 20                          |
| Gender presentation | Masculine 55 · Feminine 45                          |
| Apparent age        | Late 20s 20 · Mid 30s 30 · Mid 40s 30 · Late 50s 20 |

**Skin → ink rule:** deep-skin mints draw Field Ink only from the warm subset
(Vermilion, Ochre, Gold Leaf); the accent doubles as the face midtone so deep-brown
faces render in black + warm-accent + cream with no out-of-palette fourth tone.

## Combinatorics & odds

- **6,048** surfaced-attribute combinations (5 slots).
- **~2.0% legendary** (`1 − (1−.005)(1−.005)(1−.010) = 1.99%` — Gold Leaf 0.5%,
  legendary Vice 0.5%, Confetti 1.0%).
- **~7.2% rare-or-better** (`1 − (.993·.990·.990·.979·.974) = 7.20%`).
- Rarest possible mint ("The Bonfire": Manic Laugh + Gold-Threaded Power Suit +
  Champagne Coupe + Gold Leaf + Confetti Storm) ≈ 7 × 10⁻¹² — a theoretical ceiling.

## Legendary stacking policy

**Stacking is allowed — no one-legendary-cap.** Phase 2 rendered 3 maximally-stacked
mints and all 3 survived composition (still read as one coherent screenprint bust),
so a single mint may roll multiple legendary values. The compound math above is
unchanged (no cap applied).

## Phase-2 redesigns (renderability)

Four values were redesigned to pass the ≥90% renderability bar; weights/tiers are
unchanged, only the visual + display name:

| Original (review6)        | Shipped (review7)        | Why                                                                                     |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| Two Lit Cigarettes        | **Cigarette Bouquet**    | exact count of 2 unrenderable/uncheckable; a fistful of 5+ reads as excess              |
| Champagne Bottle Mid-Pour | **Champagne Coupe**      | the pour arc + hand failed; an overflowing coupe has no fragile arc                     |
| Faint Ticker-Tape Lines   | **Bold Ticker Bands**    | faint tape washed out at 64px; bold bands read at icon size                             |
| Solid Gold (flat)         | **Gold Leaf** (metallic) | flat gold was indistinguishable from common Ochre; metallic gold-leaf separates cleanly |

The gold-leaf redesign initially leaked a readable "1987" date; the exclusion block
was hardened (no numerals / dates / badges) and the leak cleared across the full
Phase-3 roster. That hardened clause is the `EXCLUSIONS` string in
`convex/lib/portraitSeed.ts` and must never be weakened.
