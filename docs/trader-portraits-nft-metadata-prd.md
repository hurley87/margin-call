# Trader Portrait Images + NFT Metadata PRD

## Overview

Margin Call should generate a unique 1980s Wall Street trader portrait for every trader when the trader is created. The portrait should appear in the dashboard, public trader profile page, and NFT metadata.

Trader creation must remain fast and non-blocking. Use the existing Convex trader creation pipeline: create the trader record immediately, then schedule portrait generation asynchronously in parallel with wallet and NFT creation. The current `traders.create` mutation already inserts a trader and schedules wallet creation asynchronously; portrait generation should follow that same pattern.

The trader record should store Convex Storage IDs and image state, not resolved image URLs. UI-facing queries should resolve storage IDs into URLs before returning data to React components.

## Goals

- Every new trader receives one generated square profile portrait.
- Portraits are stored in Convex Storage.
- Trader records store `profileImageStorageId`, not resolved image URLs.
- Dashboard views show a loading or fallback portrait immediately after trader creation.
- NFT metadata is dynamic, public, and valid before image generation completes.
- NFT metadata uses the generated portrait once ready and a static fallback while pending or failed.
- The public trader detail page shows the same portrait used by NFT metadata.
- Wallet/NFT creation and portrait generation run independently in parallel.
- The ERC-8004 mint uses a stable app metadata URL instead of inline JSON metadata.

## Non-goals

- No user-facing portrait customization in v1.
- No user-facing regenerate or reroll flow in v1.
- No backfill for existing traders.
- No separate portrait table.
- No raw public trader record exposure.
- No public exposure of raw mandate, full personality text, internal wallet data, image prompt text, prompt provenance, internal metadata blobs, or internal errors.
- No custom image proxy route in v1.
- No changes to escrow logic, game mechanics, deal resolution, or smart contract behavior beyond replacing the NFT agent URI used at mint time.

## Key Decisions

- Image generation is asynchronous and non-blocking.
- The dashboard shows the trader immediately with a pending portrait state.
- NFT metadata is dynamic and served from Next.js route handlers.
- The canonical metadata route uses Convex `traderId`.
- Images are generated automatically by a Convex internal action using OpenAI.
- The prompt is mostly deterministic and uses a stored image variant and style seed.
- Users do not choose portrait style in v1.
- Wallet/NFT creation and image generation run in parallel.
- Metadata JSON directly includes the Convex Storage URL when the image is ready.
- Metadata always returns a valid image, using `/trader-placeholder.png` while pending or failed.
- Prompt/provenance is snapshotted at trader creation.
- Later trader edits do not automatically regenerate the portrait.
- Public NFT metadata exposes clean game-facing traits, not internal prompt or mandate data.
- The metadata route is public and unauthenticated.
- Only the new public trader detail page is public in this PR; broader spectator mode can come later.

## User Experience

### Trader creation

When a user creates a trader:

1. The trader appears immediately in the dashboard.
2. The portrait area shows a retro loading placeholder.
3. The UI displays friendly copy such as "Portrait developing...", "Generating trader portrait...", or "Temporary trading floor ID shown."
4. Once image generation succeeds, the generated portrait automatically replaces the placeholder.
5. If image generation fails after retries, the trader remains usable and the fallback remains visible.

Raw API, storage, and image-generation errors must not be shown to users.

### Dashboard portrait states

- `pending`: show placeholder/loading state.
- `generating`: show placeholder/loading state.
- `ready`: show generated portrait.
- `error`: show fallback image and friendly delayed message.

### Public trader page

Add a public read-only route:

```txt
/traders/:traderId
```

The page should show:

- Trader portrait
- Name
- Status
- Token ID, if available
- Portrait status
- Derived archetype
- Derived risk profile
- Game-facing escrow balance/capital
- Recent public-safe activity, limited to 5 items

The page must not show:

- `ownerSubject`
- `deskManagerId`
- `cdpOwnerAddress`
- `cdpAccountName`
- Raw mandate object
- Full personality text
- Wallet errors
- Image errors
- Cycle lease fields
- Internal metadata blobs
- Private controls

## Data Model Changes

Update `convex/schema.ts` and add optional fields directly to the existing `traders` table:

- `profileImageStorageId`: optional `v.id("_storage")`
- `imageStatus`: optional union of `"pending"`, `"generating"`, `"ready"`, `"error"`
- `imagePrompt`: optional string
- `imagePromptSource`: optional any
- `imageStyleSeed`: optional string
- `imageVariant`: optional string
- `imageRetryCount`: optional number
- `imageLastAttemptAt`: optional number
- `imageError`: optional string
- `metadataVersion`: optional number

Recommended status lifecycle:

- `pending -> generating -> ready`
- `pending -> generating -> error`
- `error -> generating -> ready`
- `error -> generating -> error`

Do not add a separate `traderPortraits` table for v1.

## Trader Creation Flow

Current flow:

1. Create trader.
2. Schedule wallet creation.
3. Return `traderId`.

New flow:

1. Assign `imageVariant`.
2. Assign `imageStyleSeed`.
3. Snapshot `imagePromptSource`.
4. Insert trader with `imageStatus = "pending"`.
5. Schedule wallet creation.
6. Schedule portrait generation.
7. Return `traderId`.

The wallet job and image job must be independent. Wallet retry must not trigger image generation. Image retry must not trigger wallet creation.

## Image Generation

Create a new Convex module:

```txt
convex/traderImages.ts
```

Add:

- `generateForTrader` internal action
- `markGenerating` internal mutation
- `applyImageReady` internal mutation
- `applyImageError` internal mutation
- `regenerateForTrader` internal/admin action

The project already has `openai` installed, so no new image SDK dependency is required.

### Environment variables

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL`

Hardcode image model and size config in code for v1:

- `model`: `gpt-image-1`
- `size`: `1024x1024`

### Prompt direction

Base prompt:

```txt
Create a square profile picture of a fictional 1987 Wall Street trader for a retro trading game. High-end retro game character portrait, pixel-art inspired, detailed face, head-and-shoulders portrait, serious expression, period-accurate suit and tie, dramatic trading floor or finance office background, green CRT terminal glow, warm amber lighting, dark moody palette, clean silhouette, no border, no text, no logos, no cryptocurrency, no modern devices.
```

Add controlled variation using:

- Trader name
- Snapshotted mandate summary
- Snapshotted personality summary
- Image variant
- Style seed

Allowed variants:

- `phone_trader`
- `risk_manager`
- `macro_analyst`
- `junk_bond_operator`
- `execution_desk`
- `mna_dealmaker`
- `commodities_broker`
- `equity_salesman`

Include light diversity guidance:

```txt
Across generated traders, vary age, gender presentation, facial features, hairstyle, suit styling, and background details.
```

Do not store or expose demographic traits.

### Retry behavior

Use capped automatic retries:

- Max attempts: 3

On failure:

- Increment `imageRetryCount`.
- Set `imageLastAttemptAt = Date.now()`.
- If retry count is below the cap, schedule another generation attempt.
- If retry count reaches the cap, set `imageStatus = "error"` and store `imageError` internally.

Do not show raw `imageError` to normal users.

### Regeneration

Add admin/internal-only regeneration.

Rules:

- No normal user-facing regenerate button in v1.
- Preserve the old image while the new image generates.
- Replace `profileImageStorageId` only after the new image is stored successfully.
- Delete the old stored image only after replacement succeeds.
- If regeneration fails, keep the old image untouched.

## Convex Public Read Model

Add one public Convex query:

```txt
traders.getPublicProfile
```

This query powers:

- `/api/nft/trader/:traderId/metadata`
- `/traders/:traderId`

Input:

- `traderId: Id<"traders">`

Return curated data only:

- `trader.id`
- `trader.name`
- `trader.status`
- `trader.tokenId`
- `trader.escrowBalanceUsdc`
- `trader.imageStatus`
- `trader.profileImageUrl`
- `trader.archetype`
- `trader.riskProfile`
- `trader.createdAt`
- `recentActivity`, limited to 5 records

Each recent activity item should include only:

- `activityType`
- `message`
- `dealId`
- `createdAt`

Recent activity should be sourced from `agentActivityLog`.

Do not return raw metadata, `dedupeKey`, raw mandate, full personality, owner subject, wallet internals, or errors.

Authenticated dashboard queries should also resolve `profileImageUrl` from `profileImageStorageId` so React components do not need to know about Convex Storage internals.

## NFT Metadata Route

Implement metadata in Next.js route handlers, not Convex HTTP actions.

Add:

```txt
src/app/api/nft/trader/[traderId]/metadata/route.ts
```

Route:

```txt
GET /api/nft/trader/:traderId/metadata
```

Behavior:

1. Read trader public profile from Convex.
2. Use generated `profileImageUrl` when available.
3. If the image is missing, pending, or failed, use fallback image.
4. Return ERC-721-compatible JSON.

Response fields:

- `name`: trader name
- `description`: `A fictional 1980s Wall Street trader in Margin Call.`
- `image`: generated Convex Storage URL when ready, otherwise fallback image URL
- `external_url`: `NEXT_PUBLIC_APP_URL + /traders/:traderId`
- `attributes`:
  - `Status`
  - `Portrait Status`
  - `Archetype`
  - `Risk Profile`
  - `Token ID`, when available

Use `NEXT_PUBLIC_APP_URL` for fallback image URLs and `external_url`.

Fallback image:

```txt
/public/trader-placeholder.png
```

The metadata route must be public and unauthenticated.

## NFT Mint Integration

Update `convex/wallet.ts`.

Current logic builds inline JSON metadata. Replace it with a stable URL:

```ts
const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
const agentURI = `${appUrl}/api/nft/trader/${traderId}/metadata`;
```

The new `agentURI` should be stable from mint time even if image generation is still pending.

## Frontend UI Changes

Update trader UI surfaces to support portraits. Likely areas:

- Dashboard trader cards/roster
- Trader detail page
- Activity feed rows if they show trader identity
- Approval/deal cards if they reference a trader

Create a shared component:

```txt
TraderAvatar
```

Props:

- `name: string`
- `src?: string | null`
- `imageStatus?: "pending" | "generating" | "ready" | "error"`
- `size?: "sm" | "md" | "lg"`

Behavior:

- If `ready` and `src` exists, show image.
- If `pending` or `generating`, show fallback with loading treatment.
- If `error` or missing, show fallback/initials.
- Do not bake a border into the image itself; UI may frame the image with CSS.

## Public Trader Detail Page

Add:

```txt
src/app/traders/[traderId]/page.tsx
```

Render public profile data from `traders.getPublicProfile`.

Sections:

- Hero/card with portrait
- Name and status
- Token ID
- Portrait status
- Archetype
- Risk profile
- Desk capital/escrow balance
- Recent activity list

The page should work unauthenticated. Owner-only controls can be added later.

## Derived Public Labels

Create helper functions to derive public labels from internal data without exposing raw mandate:

- `deriveArchetype(trader)`
- `deriveRiskProfile(trader)`
- `derivePortraitStatus(trader)`

Example mappings:

- High `bankroll_pct` or high `max_entry_cost_usdc` -> `Aggressive`
- Low `bankroll_pct` or low entry limits -> `Conservative`
- Keywords include `junk bonds` -> `Junk Bond Operator`
- Keywords include `macro`, `fed`, `oil`, or `treasury` -> `Macro Analyst`
- Keywords include `takeover`, `merger`, or `acquisition` -> `M&A Dealmaker`

Fallbacks:

- Archetype: `Wall Street Operator`
- Risk Profile: `Balanced`

## Fallback Image

Assume this file exists:

```txt
public/trader-placeholder.png
```

Use it for:

- Dashboard loading state
- Dashboard error state
- Metadata image while generated image is unavailable
- Public trader page fallback

For metadata, always use an absolute URL:

```txt
NEXT_PUBLIC_APP_URL + /trader-placeholder.png
```

## Testing

Add or update tests where practical:

- Schema accepts new optional image fields.
- Trader creation initializes image fields.
- Trader creation schedules image generation.
- Wallet mint uses stable metadata URL instead of inline JSON.
- Public profile query excludes private fields.
- Public profile query resolves `profileImageUrl`.
- Metadata route returns valid JSON.
- Metadata route returns fallback image when portrait is pending.
- Metadata route returns generated image when ready.
- Public trader page handles pending, ready, and error states.
- Image retry logic caps retries.

Run:

```sh
pnpm lint
pnpm test
pnpm build
```

Note: existing lint failures are documented in `AGENTS.md`; verify whether new work introduces additional failures.

## Acceptance Criteria

- A newly created trader appears immediately in the dashboard with a portrait placeholder.
- The trader record has `imageStatus = "pending"` at creation.
- Image generation runs asynchronously after trader creation.
- Wallet/NFT creation still runs asynchronously and independently.
- The ERC-8004 identity NFT is minted with a stable metadata URL.
- The metadata URL is public and returns valid JSON before the image is ready.
- Metadata JSON uses `/trader-placeholder.png` while pending or failed.
- The generated portrait is stored in Convex Storage.
- The trader stores `profileImageStorageId`.
- UI queries return a resolved `profileImageUrl`.
- The dashboard updates to show the generated portrait once ready.
- The public trader page exists at `/traders/:traderId`.
- Metadata `external_url` points to `/traders/:traderId`.
- The public trader page is unauthenticated and read-only.
- The public query does not expose private/internal trader fields.
- Normal users never see raw image-generation errors.
- Admin/internal regeneration can replace an image safely without breaking the existing portrait.

## Implementation Order

1. Ensure fallback image exists at `public/trader-placeholder.png`.
2. Add image fields to `convex/schema.ts`.
3. Add public profile/read helpers and derived label helpers.
4. Update `traders.create` to assign image seed/variant and schedule image generation.
5. Add `convex/traderImages.ts`.
6. Update wallet minting to use stable metadata URL.
7. Add Next.js metadata route.
8. Add public trader detail page.
9. Update dashboard/trader UI to use `TraderAvatar`.
10. Add tests.
11. Run lint, test, and build.
