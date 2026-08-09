# Whoever creates a round supplies its Inco fee; the game contract holds no ETH

An earlier draft had the game contract pay `inco.getFee()` from a funded ETH balance for both round-creation paths. Because `openRound` is permissionless, that design lets anyone materialize an empty round every epoch and burn one fee per minute from operator funding until real entries cannot be paid for — and sponsoring only the `enter` path does not close the drain, since tUSD margin is faucet-claimable and therefore nearly free to a griefer. Inco's own reference examples require the caller to supply the randomness fee.

The decision: both `openRound` and round-creating `enter` are payable and require `msg.value >= inco.getFee()`, forwarding exactly the fee and refunding any excess atomically. Entering an existing round requires no ETH and rejects a nonzero `msg.value`. The game contract sponsors nothing and holds no ETH between transactions, which deletes the drain surface outright rather than rate-limiting it.

Consequences: the optional keeper pays fees for routine pre-opens from its own wallet as an operator cost, so the monitored balance is the keeper wallet, not the game contract; and a player whose entry lazily creates a round pays that round's fee, a rare path when a keeper pre-opens ahead of demand, and one the interface must price honestly before signing.
