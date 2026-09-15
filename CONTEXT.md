# Margin Call

Margin Call is the proposed product for transferable financed spot positions. This glossary describes the V1 product; implementation requirements live in the PRD.

## Positions and ownership

**Margin Call**:
The product that finances additional NVDAc exposure and makes each stock-plus-debt position transferable.
_Avoid_: Stock Gacha, shared inventory protocol

**Position**:
One attributed quantity of NVDAc together with its remaining principal, accrued interest, and lifecycle history.
_Avoid_: Lot, Position Account

**Position NFT**:
The transferable ownership representation of an active position, including its existing debt and liquidation risk.
_Avoid_: Collectible, debt-free receipt

**Position owner**:
The current holder of a Position NFT and beneficiary of that position's residual assets. Ownership does not create personal liability for a liquidation shortfall.

**Executor**:
An optional delegate authorized only to repay debt and reduce exposure for one position. The role is distinct from authority to transfer or close the NFT.

**NFT operator**:
An address approved under ERC-721 rules to transfer an owner's NFTs. Transfer authority alone grants no position-management authority.

## Financing and valuation

**NVDAc**:
The supported Coinbase tokenized NVIDIA equity asset. Raw token units are valued against the Coinbase/Chainlink total-return feed; the B20 multiplier is not applied a second time.

**Credit Pool**:
Protocol-owned USDC capital available only for financed position opening.
_Avoid_: Public LP vault, House Reserve

**Available credit**:
The Credit Pool's liquid USDC available for new financed openings.

**Principal**:
Borrowed USDC that remains unpaid on a position, excluding interest.

**Accrued interest**:
The simple financing charge earned on outstanding principal over elapsed time.

**Current debt**:
Remaining principal plus all accrued interest through the current time.

**Outstanding principal**:
The sum of remaining principal across active positions. Finalized liquidation removes the affected position's remaining principal, including any unrecovered portion.

**NAV**:
The oracle-valued gross NVDAc exposure of a position before subtracting debt.

**Equity**:
NAV minus current debt. Negative equity describes a collateral shortfall, not personal owner liability.

**Gross leverage**:
NAV divided by positive equity. V1 leverage is selected at opening only; there is no post-open leverage-increase action.

**Maintenance equity ratio**:
The minimum equity-to-NAV ratio before a financed position becomes eligible for liquidation. It never restricts NFT transfer.

## Lifecycle actions

**Repay**:
Oracle-free external USDC repayment, applied to accrued interest first and principal second.

**Reduce exposure**:
Sell a caller-specified amount of NVDAc into USDC and apply realized proceeds to debt. V1 exposes `reduceExposure(tokenId, stockAmount, minOut)` rather than target-leverage adjustment.

**Normal close**:
Owner-initiated exit available only after current debt reaches zero. It returns remaining assets and burns the NFT.

**Transfer**:
Standard ERC-721 ownership transfer with no oracle, health, leverage, or positive-equity gate. Existing stock, debt, interest, and liquidation risk follow the NFT unchanged.

## Settlement and losses

**Liquidation**:
A permissionless full unwind of an eligible financed position. V1 pays no liquidator reward or protocol liquidation fee.

**Shortfall**:
The amount by which current debt exceeds actual liquidation proceeds, including unrecovered principal and unpaid interest.

**Realized bad debt**:
The shortfall recorded when liquidation finalizes, absorbed by the protocol treasury without a claim on any NFT owner or other position.

**Principal loss**:
Borrowed principal not recovered by liquidation proceeds, tracked separately from unpaid interest.

**First-party keeper**:
The protocol-operated participant that submits eligible liquidations. It has no privileged bypass and receives no protocol liquidation reward.
