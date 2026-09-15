# Margin Call

Margin Call is the proposed product for transferable financed spot positions. This glossary describes that product; implementation requirements and status live in the PRD.

## Positions and ownership

**Margin Call**:
The product that finances additional NVDAc exposure and makes each stock-plus-debt position transferable.
_Avoid_: Stock Gacha, shared inventory protocol

**Position**:
One attributed quantity of NVDAc together with its remaining principal, accrued interest, and lifecycle history.
_Avoid_: Lot, Position Account

**Position NFT**:
The transferable ownership representation of an active position, including its equity and existing liquidation risk.
_Avoid_: Collectible, debt-free receipt

**Position owner**:
The current holder of a Position NFT and beneficiary of that position's residual assets. Ownership does not create a personal claim for a liquidation shortfall.
_Avoid_: Original depositor when referring to the current owner

**Executor**:
An optional delegate authorized to manage leverage and repayment for one position. This role is distinct from authority to transfer its NFT.

**NFT operator**:
An address approved to transfer an owner's NFTs. Transfer authority alone does not grant position-management authority.

## Financing and valuation

**NVDAc**:
The supported Coinbase tokenized NVIDIA equity asset; token units are distinct from the share-equivalent quantity represented by those units.
_Avoid_: One token equals one share

**Credit Pool**:
Protocol-owned USDC capital available to finance purchases of additional NVDAc.
_Avoid_: Public LP vault, House Reserve

**Available credit**:
The Credit Pool's liquid USDC available for new financing. Outstanding loans and realized losses are not available credit.

**Principal**:
Borrowed USDC that remains unpaid on a position, excluding interest.
_Avoid_: Lifetime borrowing, inventory principal

**Accrued interest**:
The simple financing charge earned on outstanding principal over elapsed time, whether or not it has yet been stored.

**Current debt**:
A position's remaining principal plus all accrued interest through the current time.

**Outstanding principal**:
The sum of remaining principal across active positions. Finalized liquidation removes the affected position's remaining principal, including any unrecovered portion.

**NAV**:
The oracle-valued gross NVDAc exposure of a position before subtracting debt.
_Avoid_: Equity, net position value

**Equity**:
NAV minus current debt. A negative value describes a collateral shortfall, not a personal liability of the owner.

**Gross leverage**:
NAV divided by positive equity. Target leverage describes a requested action; current leverage changes with prices, costs, and interest.

**Maintenance equity ratio**:
The minimum equity-to-NAV ratio before a financed position becomes eligible for liquidation. It does not restrict NFT transfer.

**Position performance**:
Performance since inception, adjusted for contributions, repayments, and returned assets. It does not represent the current owner's return on an unknown NFT purchase price.

## Settlement and losses

**Normal close**:
An owner-initiated exit that repays current debt in full and returns remaining assets, preserving as much NVDAc as execution permits.

**Liquidation**:
A permissionless full unwind of an eligible financed position, with sale proceeds distributed according to repayment priority.

**Shortfall**:
The amount by which current debt exceeds actual liquidation proceeds. It includes unrecovered principal and unpaid interest.

**Realized bad debt**:
The shortfall recorded when liquidation finalizes, absorbed by the protocol treasury without a claim on any NFT owner or other position.

**Principal loss**:
The borrowed principal that liquidation proceeds did not recover, separate from unpaid interest.

**Liquidator reward**:
The liquidation incentive capped at 1% of gross realized sale proceeds and limited by what remains after full debt repayment.

**First-party keeper**:
The protocol-operated participant that submits eligible liquidations, including those offering no reward. It has the same execution and oracle constraints as any other liquidator.
