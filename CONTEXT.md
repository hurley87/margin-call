# Margin Call: The Floor

Margin Call is a trading-floor game in which human-run desks equip autonomous traders to acquire, trade, and redeem blind lots of tokenized stocks.

## Participants

**Desk Manager**:
The human who owns a desk, creates its traders, funds their activity, and sets their authority and risk limits.
_Avoid_: Player, user

**Desk**:
A manager and the traders under that manager's control.
_Avoid_: Account, team

**Trader**:
An autonomous market participant with its own identity, inventory, authority, and performance record.
_Avoid_: Bot, wallet, agent account

**Trader Sale**:
A transfer of Trader ownership that also transfers control of the Trader's complete inventory and balances. Automation stops until the new owner claims and reconfigures the Trader.
_Avoid_: Lot sale, desk transfer

**Supplier**:
An approved participant who stocks a Window with tokenized shares in exchange for sale proceeds and a share of surplus.
_Avoid_: Liquidity provider, depositor

**House**:
The operator of the Window, Floor, and Wire. The House supplies reserve capital but does not supply stock inventory as principal.
_Avoid_: Dealer, market maker

## Inventory and value

**Window**:
The venue where a desk pays a fixed price to receive a randomized Lot from a published basket and size distribution.
_Avoid_: Loot box, pool

**Rip**:
The purchase of one randomized Lot from a Window for a fixed Rip Price.
_Avoid_: Mint, roll

**Rip Price**:
The amount paid for a Rip. It is the receiving Trader's initial Acquisition Cost.
_Avoid_: Basis, intrinsic value

**Lot**:
A transferable position representing a fixed raw quantity of one tokenized stock, together with immutable origin information.
_Avoid_: Share, pack, position NFT

**Test Asset**:
A valueless token or price feed used on Robinhood Chain testnet when a canonical testnet equivalent is unavailable. It must be visibly identified as a Margin Call test instrument.
_Avoid_: Stock Token, real stock, USDG

**Regular Lot**:
The common Rip outcome in a Window's configured size distribution.
_Avoid_: Odd lot, round lot, common grade

**Block**:
A rare, oversized Rip outcome. Block is a game rarity term, not a claim about the position meeting a securities-market block threshold.
_Avoid_: Jackpot, institutional block

**Origin Intrinsic Value**:
The oracle value of a Lot's underlying stock when the Lot is created. It never changes and is not a holder's purchase price.
_Avoid_: Basis, acquisition cost

**Acquisition Cost**:
The known amount a Trader paid to acquire a Lot through a Rip or Floor purchase.
_Avoid_: Origin value, mint value

**Direct Transfer**:
A Lot transfer outside the Floor. Margin Call does not infer a purchase price or score profit for the recipient from that transfer.
_Avoid_: Trade, fill

**Crack**:
The irreversible redemption of a Lot for its underlying tokenized stock, less the configured raw-token fee.
_Avoid_: Sale, cash-out

## Market and performance

**Floor**:
The market where Traders offer and exchange Lots for USDG.
_Avoid_: Window, exchange

**Offer Book**:
The active collection of signed Lot sale offers available to be lifted on the Floor.
_Avoid_: Order book, bid book, auction

**Fill**:
A completed Floor purchase that transfers a Lot for its quoted price.
_Avoid_: Rip, transfer

**Realized P&L**:
The net proceeds from a scored Floor sale minus that Trader's known Acquisition Cost. Cracks and Direct Transfers do not realize scored P&L.
_Avoid_: Premium, origin gain

**House Reserve**:
Recoverable USDG capital supplied by the House so every accepted Rip can satisfy its largest possible supplier obligation.
_Avoid_: Rake, supplier balance

**Capacity Slot**:
The worst-case inventory and USDG capacity reserved for one pending Rip until it is completed or refunded.
_Avoid_: Lot, order slot

**Wire**:
The Floor's press feed, which narrates confirmed events without deciding outcomes, predicting prices, or inventing facts.
_Avoid_: Oracle, advisor
