# The settlement asset is a project-deployed token with an in-app faucet, not Circle tUSDC

The MVP originally mandated Circle's Base Sepolia testnet USDC and explicitly forbade a mock. We reversed that: settlement uses **Desk Dollars (`tUSD`)**, a project-deployed 6-decimal ERC-20 with an owner-minted `25,000` bankroll seed and a rate-limited public faucet (`100 tUSD`/wallet/hour) surfaced in the interface. Two facts drove the reversal: Circle's faucet dispenses 20 tUSDC per address per 2 hours, making the 25,000 bankroll an external-dependency problem (a Discord grant request or a ~1,250-claim multi-address sweep), and every player — including judges — needed an off-site faucet trip before their first entry, defeating the enter-in-under-30-seconds goal. The Circle requirement carried no Game Jam benefit, so we traded settlement-asset realism (scored once, in a writeup) for zero acquisition risk and cold-wallet onboarding in seconds (scored every time someone plays).

## Consequences

- Mainnet intent is unchanged: real Circle USDC. `DeskDollars` must never be deployed to mainnet or presented as Circle USDC.
- The token contract needs its own small test surface: faucet amount, cooldown, and no other unrestricted mint path.
