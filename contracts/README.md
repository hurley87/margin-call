# Margin Call contract workspace.

#

# Foundry workspace for Margin Call protocol contracts, tests, fork verification, and local signer smoke flows.

#

# Restore gitignored libraries after clone:

# pnpm install:forge-deps

#

# Checks:

# pnpm test:contracts

# pnpm test:contracts:ci

#

# Local Anvil-only signer smoke tests:

# spot: see script/README.md / pnpm test:contracts:smoke

# financed: see script/README.md / pnpm test:contracts:smoke:financed

# executor transfer: see script/README.md / pnpm test:contracts:smoke:executor-transfer

#

# Canonical Base launch deploy + acceptance:

# see script/BASE_LAUNCH.md / deployments/base.json

# pnpm contracts:deploy:base:dry / pnpm contracts:accept:base:dry

# Live broadcast is gated (CONFIRM_BASE_MAINNET=I_UNDERSTAND); not an ungated pnpm script.

# Historical NVDA-only evidence: script/BASE_NVDA_ONLY.md / deployments/base-nvda-only.legacy.json

#

# Production contracts in src/:

# MarginCall, CreditPool, OracleAdapter, ExecutionAdapter
