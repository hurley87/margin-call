# Margin Call docs

## Product front door

See the root [README](../README.md) for the product thesis, canonical Base launch, and shipped vs planned app status.

## V1 behavior spec

[Transferable Financed Spot Positions PRD](margin-account-prd.md) is the V1 behavior and acceptance spec. It supersedes the standalone Stock Gacha MVP and generalized inventory-protocol proposals.

The **contract layer** is deployed and live-accepted on Base. Canonical addresses and compact live-acceptance evidence: [`contracts/deployments/base.json`](../contracts/deployments/base.json). Deploy / acceptance runbook: [`contracts/script/BASE_LAUNCH.md`](../contracts/script/BASE_LAUNCH.md).

The **application layer** remains separate: today's site is a minimal Base Position workspace (connect → open → repay → close), not the production frontend. Human UI, agent surface, living NFT presentation, indexing, and keeper automation are planned unless a later doc marks them shipped.

V1 deliberately keeps ownership and position accounting in one contract: `MarginCall` itself inherits ERC-721 and mints/burns the Position NFTs. There is no separate `PositionNFT` contract.

- [Canonical product glossary](../CONTEXT.md)
- [NFT transfer availability decision](adr/0001-independent-nft-transfer-availability.md)
- [Treasury loss and liquidation decision](adr/0002-finalize-shortfalls-as-treasury-losses.md)

The PRD defines behavior and acceptance criteria. The glossary defines terms. ADRs explain consequential trade-offs.
