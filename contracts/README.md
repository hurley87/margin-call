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

#

# Production contracts in src/:

# MarginCall, CreditPool, OracleAdapter, ExecutionAdapter
