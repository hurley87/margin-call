---
status: proposed
---

# Stock Gacha grades are fixed at deposit

A lot's grade — the number that sets its selection odds — is read from the oracle once when the lot is deposited and then held fixed, rather than recomputed from a live price at each rip. Selection weights therefore never move, so the pool's expected value is an O(1) read over running aggregates and concurrent rips can draw from a weighted tree without a snapshot or a global lock. The selected Maker is paid from a _live_ price read at their rip's purchase, not from the grade.

## Considered options

**Live NAV for both odds and payout.** The original design. Every oracle tick reshuffles every weight, so a rip has to freeze the pool at purchase, which forces one unsettled rip at a time. Rejected on throughput: StockRip's public numbers imply several draws a minute, which no single-threaded design reaches.

**Deposit-locked NAV for both odds and payout.** Fixes the weights, but makes Makers synthetically short their own stock — profitable to withdraw when it rallies, profitable to leave when it falls. The pool fills with overvalued lots and Rippers systematically receive less than the odds screen quotes. Rejected: the leak is structural and invisible.

**Depositor-set grade within an oracle band, with the premium escrowed.** The faithful port of StockRip, where the depositor's own escrow is what disciplines grade inflation. Rejected for the MVP only because it requires Makers to bring a second asset. Note that the same design _without_ the escrow is unsound: expected profit is monotonically increasing in grade, so every Maker grades at the band cap and the surcharge stacks on top of an inflated base.

## Consequences

Splitting one concept into two numbers is the price of concurrency, and it needs three guards. Grades go stale, so a permissionless `refresh(lotId)` re-locks them and lots older than the staleness bound leave the active pool. The payout is live while coverage is sized against the grade, so the payout is capped at a fixed multiple of grade. And without a snapshot the pool can move under a pending rip, so Rippers set a drift bound that refunds rather than draws when breached.
