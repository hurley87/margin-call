# Tradable Asset NFTs

> Design exploration for turning the Asset Inventory into on-chain NFTs that can be independently bought, sold, and transferred between traders.

## Current State

Assets are off-chain database rows in the `assets` table — a name, a USDC value, and a link to the trader/deal that produced them. They influence gameplay (fed into the LLM prompt during deal resolution) but have no on-chain presence.

Traders are already on-chain — ERC-8004 NFTs with ERC-6551 token-bound accounts (wallets). When a trader NFT is sold, all carried assets implicitly transfer with ownership. But assets are not independently tradable today.

### Database schema (current)

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references traders(id) on delete cascade,
  name text not null,
  value_usdc numeric not null default 0,
  source_deal_id uuid references deals(id),
  source_outcome_id uuid references deal_outcomes(id),
  acquired_at timestamptz not null default now()
);
```

---

## Proposed: On-Chain Asset NFTs

### Approach 1: ERC-1155 Semi-Fungible Tokens (recommended)

Mint assets as ERC-1155 tokens owned by the trader's ERC-6551 token-bound account.

**Why ERC-1155:**

- **Multiple copies** — "insider tip" and "SEC immunity" can exist across many traders. Semi-fungible makes sense for common assets.
- **Batch operations** — ERC-1155 supports batch transfers, so gaining/losing multiple assets in a single deal outcome is one transaction.
- **Low gas** — much cheaper than minting individual ERC-721s for every $0.15 rumor memo.
- **Already composable** — the trader's ERC-6551 wallet can already hold ERC-1155 tokens with no new infrastructure.

**Minting flow:**

1. Deal resolves → GPT-5 mini awards "shadow contact at Bear Stearns"
2. Server mints ERC-1155 token to the trader's TBA wallet (can be batched with `resolveEntry`)
3. Asset shows up in inventory (on-chain source of truth, mirrored to Supabase for fast reads)
4. Desk manager can transfer individual assets between their own traders, or list them for sale

### Approach 2: ERC-721 for Unique/Legendary Assets

For rare one-of-a-kind items — say a "Milken's personal Rolodex" that only one trader in the entire game can hold — mint as individual ERC-721 NFTs. These would be high-value collectibles that drive marketplace excitement.

**Hybrid model:** Use ERC-1155 for common/uncommon assets and ERC-721 for legendary one-offs. The contract can support both, or deploy two separate contracts.

---

## Asset Rarity Tiers (suggested)

| Tier          | Examples                                           | Supply                      | Token Standard |
| ------------- | -------------------------------------------------- | --------------------------- | -------------- |
| **Common**    | rumor memo, offshore slush connection              | Unlimited                   | ERC-1155       |
| **Uncommon**  | forgery dossier, leaked tape, trade blotter scrap  | Unlimited (lower drop rate) | ERC-1155       |
| **Rare**      | shadow contact at Bear Stearns, quiet auction slot | Capped supply (e.g. 50)     | ERC-1155       |
| **Legendary** | Milken's personal Rolodex, SEC immunity badge      | Unique (supply of 1)        | ERC-721        |

Rarity would be determined by the LLM during deal resolution, guided by the system prompt and a random seed. Higher-stakes deals have better legendary drop rates.

---

## Contract Design

### MarginCallAssets.sol (ERC-1155)

```
MarginCallAssets
  ├── mint(to, tokenId, amount, data)          — operator only (server)
  ├── mintBatch(to, tokenIds, amounts, data)   — operator only (batch mint from deal outcome)
  ├── burn(from, tokenId, amount)              — operator only (asset lost in deal)
  ├── burnBatch(from, tokenIds, amounts)       — operator only (batch burn)
  ├── uri(tokenId) → string                    — metadata URI per asset type
  ├── setURI(tokenId, uri)                     — admin only
  └── Standard ERC-1155 transfer functions     — players can freely transfer/sell
```

**Authorization:** Only the whitelisted operator (same server wallet that calls `resolveEntry`) can mint and burn. Players can transfer freely using standard ERC-1155 `safeTransferFrom`.

**Metadata:** Each `tokenId` maps to an asset type (e.g. tokenId 1 = "insider tip", tokenId 2 = "SEC immunity"). Metadata JSON follows OpenSea standards:

```json
{
  "name": "Shadow Contact at Bear Stearns",
  "description": "A discreet connection inside Bear Stearns. Gives an edge in deals involving distressed debt and institutional drama.",
  "image": "ipfs://...",
  "attributes": [
    { "trait_type": "Rarity", "value": "Rare" },
    { "trait_type": "Category", "value": "Contact" },
    {
      "trait_type": "Base Value (USDC)",
      "display_type": "number",
      "value": 0.3
    }
  ]
}
```

---

## Integration with Existing Systems

### Deal Resolution

The `resolveEntry` flow already goes on-chain. Asset minting can be batched into the same transaction or executed as a follow-up call:

```
resolveEntry(dealId, traderId, pnl)  →  existing
mintBatch(traderTBA, assetIds, [1,1], "")  →  new
```

### LLM Prompt

No change needed — the system prompt already includes the trader's asset inventory. The source of truth shifts from Supabase to on-chain, with Supabase as a read cache (same pattern used for balances and reputation today).

### Asset Inventory UI

The `AssetInventory` component in `src/app/traders/[id]/page.tsx` already renders assets from the `useTraderAssets` hook. The hook would read from the mirrored Supabase data (same as today), but the on-chain data becomes the source of truth.

Add transfer/sell buttons per asset for desk managers who own the trader.

---

## What This Unlocks

- **Asset marketplace** — players buy/sell individual assets, not just whole traders. Want to load your trader up with Goldman contacts before a big deal? Buy them.
- **Strategic pre-positioning** — acquire assets that give a trader an edge in specific deal types, since the LLM weighs them during resolution.
- **Asset stripping** — before selling a trader, strip out valuable assets and keep them, or move them to another trader on your desk.
- **Price discovery** — the market determines what "SEC immunity" is actually worth, not just the $0.50 the LLM assigned.
- **Composability** — assets appear in any wallet viewer, OpenSea, etc. Third-party tools can build on top.
- **Looting** — when a trader gets wiped out, their assets could drop into the deal pot (claimable by the deal creator or other entrants), creating a "loot drop" mechanic.

---

## Trade-offs

| Factor         | Pro                                    | Con                                                          |
| -------------- | -------------------------------------- | ------------------------------------------------------------ |
| Gas costs      | Base L2 is cheap ($0.001–$0.01 per tx) | Still a cost on every deal resolution that grants assets     |
| Complexity     | Rich metagame, marketplace depth       | More contracts to deploy and audit, more failure modes       |
| Game balance   | Players invest more deeply             | Whales can buy their way to dominant asset inventories       |
| UX             | Assets feel "real" and ownable         | Extra on-chain steps in the 30-second trade cycle            |
| Supply control | Rarity tiers create scarcity           | Need careful tuning to prevent inflation or scarcity spirals |

### Mitigations

- **Gas:** Batch asset mints with deal settlement. Base gas is negligible ($0.001 range).
- **Whales:** Cap the number of assets a single trader can carry (e.g. 10 slots). More assets doesn't mean better — the LLM evaluates relevance, not quantity.
- **UX:** Keep minting server-side (operator wallet). Players only go on-chain when actively transferring or selling.
- **Balance:** Some assets could be soulbound (non-transferable) — earned only, never bought. "SEC immunity" might be too powerful to sell.

---

## Open Questions

1. **Should assets be soulbound or transferable?** Could do a mix — common assets are tradable, legendary assets are soulbound to the trader that earned them.
2. **Asset decay?** Should assets expire or degrade over time to prevent hoarding?
3. **Crafting/combining?** Could two "rumor memos" combine into a "verified intelligence report" (higher tier)? Adds depth but also complexity.
4. **Loot drops on wipeout?** When a trader gets wiped out, do their assets get burned, drop into the deal pot, or stay with the (now-dead) NFT?
5. **Asset slots vs. unlimited carry?** A slot system (e.g. 10 max) forces strategic choices about which assets to keep. Unlimited carry rewards grinding.
6. **Marketplace integration** — build a custom in-game marketplace, or lean on OpenSea/Blur for ERC-1155 trading?

---

## Implementation Phases

### Phase A: Contract + Minting

- Deploy `MarginCallAssets.sol` (ERC-1155) on Base Sepolia
- Add asset type registry (tokenId → name, rarity, metadata URI)
- Integrate minting into the deal resolution flow
- Mirror on-chain state to Supabase `assets` table

### Phase B: Transfers + UI

- Add transfer UI to the trader detail page (move assets between own traders)
- Add asset detail view (provenance, deal history, current holder)
- Surface assets in wallet viewers via standard ERC-1155 metadata

### Phase C: Marketplace

- In-game asset marketplace (list/buy/sell)
- Or: OpenSea/Blur integration for ERC-1155 on Base
- Price history and volume tracking

### Phase D: Advanced Mechanics

- Soulbound legendary assets
- Asset decay / expiration
- Crafting / combining
- Loot drops on wipeout
