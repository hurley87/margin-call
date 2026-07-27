# Operator-selected randomness for V1 Pack selection

Robinhood Chain has Chainlink Data Feeds but no confirmed VRF or Pyth Entropy deployment, so verifiable on-chain randomness is not buildable there today. V1 selection is a trusted server-side draw by the House: the app picks uniformly from the frozen eligible set and records the outcome on-chain. This is disclosed as an operator promise, not a provable property — the eligible set and result are auditable, the draw itself is not. Revisit before any mainnet launch; VRF-grade randomness is the intended replacement when available.

## Considered Options

- House commit-reveal seed chain (auditable after the fact) — rejected for V1 as slower to build for a trust model that is still operator-anchored
- Sequencer blockhash — rejected: moves trust to Robinhood's sequencer with no honest disclosure surface
- Block launch on VRF/Entropy availability — rejected: puts the launch date in someone else's roadmap
