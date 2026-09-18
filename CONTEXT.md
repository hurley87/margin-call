# Margin Call

Margin Call is the proposed product for transferable financed spot positions. This glossary describes the V1 product; implementation requirements live in the PRD.

## Positions and ownership

**Margin Call**:
The product that finances additional exposure in a supported tokenized stock and makes each stock-plus-debt position transferable. `MarginCall` itself inherits OpenZeppelin ERC-721 and is the Position NFT contract; there is no separate `PositionNFT` contract. The live Base deployment (issue #429) is still NVDA-only V1; source now supports a curated multi-stock registry (issue #446) that is not yet redeployed.
_Avoid_: Stock Gacha, shared inventory protocol

**Position**:
One attributed quantity of a single supported stock together with its remaining principal, accrued interest, and lifecycle history. A Position never holds a basket or cross-collateralizes across stocks.
_Avoid_: Lot, Position Account

**Position NFT**:
The ERC-721 ownership representation of an active position, minted and burned directly by `MarginCall`, including its existing debt and liquidation risk.
_Avoid_: Separate PositionNFT contract, collectible, debt-free receipt

**Position owner**:
The current holder of a Position NFT and beneficiary of that position's residual assets. Ownership does not create personal liability for a liquidation shortfall.

**Executor**:
An optional delegate authorized only to repay debt and reduce exposure for one position. The role is distinct from authority to transfer or close the NFT.

**NFT operator**:
An address approved under ERC-721 rules to transfer an owner's NFTs. Transfer authority alone grants no position-management authority.

## Financing and valuation

**Supported stock / asset**:
A Coinbase tokenized equity (B20) registered in the curated append-only asset registry, with a fixed oracle adapter and Uniswap execution adapter. Launch rails in source (issue #446): NVDAc, AAPLc, METAc, GOOGLc. TSLAc was excluded after qualification found no usable Uniswap liquidity.

**NVDAc**:
The Coinbase tokenized NVIDIA equity asset. Raw token units are valued against the Coinbase/Chainlink total-return feed; the B20 multiplier is not applied a second time. The live V1 deployment supports only NVDAc.

**Credit Pool**:
Protocol-owned USDC capital available only for financed position opening.
_Avoid_: Public LP vault, House Reserve

**Available credit**:
The Credit Pool's liquid USDC available for new financed openings.

**Principal**:
Borrowed USDC that remains unpaid on a position, excluding interest.

**Borrow APR**:
The immutable V1 financing rate: 10% simple APR. V1 has no rate setter or APR-admin surface.

**Accrued interest**:
The simple financing charge earned on outstanding principal over elapsed time at the fixed 10% V1 APR.

**Current debt**:
Remaining principal plus all accrued interest through the current time.

**NAV**:
The oracle-valued gross stock exposure of a position before subtracting debt.

**Equity**:
NAV minus current debt. Negative equity describes a collateral shortfall, not personal owner liability.

**Gross leverage**:
NAV divided by positive equity. V1 leverage is selected at opening from exactly five presets: 1.0x, 1.1x, 1.25x, 1.4x, or 1.5x. There is no post-open leverage-increase action.

**Maintenance equity ratio**:
The verified V1 minimum equity-to-NAV ratio before a financed position becomes eligible for liquidation: 30%. This is a maintenance threshold, not opening margin or 30% LTV. It never restricts NFT transfer.

**Health factor**:
Equity ratio divided by maintenance equity ratio. A financed position is liquidatable when pricing is LIVE and health factor is below 1.0.

## Lifecycle actions

**Repay**:
Oracle-free external USDC repayment, applied to accrued interest first and principal second. If the caller supplies an amount greater than current debt, only current debt is transferred; the excess never leaves the caller.

**Reduce exposure**:
Sell a caller-specified amount of the position's recorded stock into USDC and apply realized proceeds to debt. V1 exposes `reduceExposure(tokenId, stockAmount, minOut)` rather than target-leverage adjustment. It requires LIVE pricing.

**Normal close**:
Owner-initiated exit available only after current debt reaches zero. It returns remaining recorded stock and burns the NFT.

**Transfer**:
Standard ERC-721 ownership transfer implemented directly by `MarginCall`, with no oracle, health, leverage, or positive-equity gate. Existing stock, debt, interest, and liquidation risk follow the NFT unchanged. The old executor is cleared internally during the ERC-721 ownership update before any safe-transfer receiver callback.

## Settlement and losses

**Liquidation**:
A permissionless full unwind of an eligible financed position. V1 pays no liquidator reward or protocol liquidation fee.

**Shortfall**:
The amount by which current debt exceeds actual liquidation proceeds.

**Realized bad debt**:
The liquidation shortfall recorded by `BadDebtRealized(tokenId, shortfall)`, absorbed by the protocol treasury without a claim on any NFT owner or other position.

**First-party keeper**:
The protocol-operated participant that submits eligible liquidations. It has no privileged bypass and receives no protocol liquidation reward.
