# No Sybil gate on participation rewards; the protocol fee is the Sybil tax

"Same-Desk Rips don't qualify" is unenforceable on a permissionless chain — a creator ripping their own Packs from a second wallet is indistinguishable from a legitimate player. V1 therefore drops identity-based exclusions entirely and prices farming in: a self-rip cycle costs the farmer $2.50 + gas (the protocol fee), and fixed per-epoch reward pots mean farmers dilute each other rather than minting extra supply. A future reader will expect Sybil protection here; its absence is deliberate.

Testnet caveat: the V1 stablecoin is a granted mock (see the PRD's Desk Grant), so on testnet the fee is paid in free money and the tax is nominal — bounded only by the per-account grant rate limit. Season participation-reward data is therefore directional. The economic argument above holds where the stablecoin costs something, i.e. mainnet.
