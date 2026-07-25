# Plan: Make The Floor Issue Suite Robinhood-Only

> Source PRD: [GitHub issue #247 — Margin Call: The Floor](https://github.com/hurley87/margin-call/issues/247)

## Architectural decisions

- **Release boundary**: The Floor is a clean replacement for the legacy Base Sepolia deal game. It is not a parallel mode and does not migrate legacy state.
- **Network boundary**: The Floor targets Robinhood Chain testnet only. Base Sepolia is not a supported Floor network, compatibility target, regression gate, or design constraint.
- **Runtime boundary**: Floor contracts, application paths, Convex orchestration, wallet flows, transaction intents, tests, and deployment proof must not depend on Base-specific configuration or services.
- **Transition boundary**: Unreplaced legacy code may remain temporarily while the Floor is built, but preserving its runtime behavior is not acceptance scope.
- **Retirement boundary**: The final contraction removes Base Sepolia and the legacy deal game from shipped source, configuration, documentation, tests, and tooling. Git history is the archive.

---

## Phase 1: Correct the governing PRD

**User stories**: Release-boundary decision and operator acceptance story 62

### What to build

Update issue #247 so every child issue inherits a Robinhood-only product and architecture boundary. Preserve the existing Floor game requirements while removing any implication that Base is a supported mode or migration source.

### Acceptance criteria

- [ ] The PRD states that Base Sepolia is abandoned legacy infrastructure rather than a Floor compatibility target.
- [ ] The PRD states that Floor code and acceptance tests must not depend on Base-specific runtime configuration.
- [ ] No migration, parallel-mode, or Base regression requirement remains.

---

## Phase 2: Correct the chain and intent foundation

**User stories**: Network readiness, sponsored actions, and safe transaction reconciliation

### What to build

Rewrite issue #249 as the Robinhood-only foundation for chain configuration and durable transaction intents. Keep the safety requirements for preparation, submission, confirmation, failure, and reconciliation while removing Base operational compatibility from the slice.

### Acceptance criteria

- [ ] The issue no longer describes an expand phase that keeps the current Base game operational.
- [ ] Base Sepolia is not registered or selected as an active Floor runtime network.
- [ ] Floor transaction state and confirmation behavior are derived exclusively from the selected Robinhood testnet deployment.
- [ ] Legacy Base behavior is not a regression gate for completion.

---

## Phase 3: Audit the playable Floor slices

**User stories**: PRD stories 1–63 covered by issues #250–#261

### What to build

Review issues #250–#261 for inherited Base assumptions without changing their product behavior. Clarify only the slices where reused application concepts could accidentally carry legacy data, scheduling, or network dependencies into the Floor.

### Acceptance criteria

- [ ] Contract, asset, wallet, confirmation, and transaction requirements refer only to Robinhood Chain testnet.
- [ ] Autonomous scheduling does not depend on the legacy deal-agent loop.
- [ ] Reusing the Wire or leaderboard means adapting presentation concepts, not importing legacy schemas, events, state, or history.
- [ ] No child issue adds a Base compatibility or regression requirement.

---

## Phase 4: Make legacy deletion explicit

**User stories**: Clean replacement decision and complete release contraction

### What to build

Strengthen issue #262 so the final cutover removes both the active legacy game and its Base Sepolia implementation artifacts. Historical recovery remains available through Git rather than retained executable code.

### Acceptance criteria

- [ ] Active legacy UI, APIs, schedulers, agent tools, and contract paths are removed.
- [ ] Base network registrations, deployment data, environment variables, documentation, tests, and tooling are removed from the shipped repository.
- [ ] Temporary compatibility structures are removed once Floor callers use Robinhood-only boundaries.
- [ ] The application builds and tests without Base secrets, RPC endpoints, addresses, or deployment files.

---

## Phase 5: Confirm a Robinhood-only release proof

**User stories**: Operator acceptance story 62 and observability story 63

### What to build

Update issue #263 so its public-testnet proof runs from a clean Robinhood-only configuration and cannot silently rely on Base infrastructure.

### Acceptance criteria

- [ ] The acceptance run requires no Base RPC, deployment, wallet, contract, environment variable, or smoke-test setup.
- [ ] All recorded evidence belongs to the Robinhood Chain testnet deployment.
- [ ] The issue remains blocked on the completed legacy contraction.

---

## Phase 6: Verify issue-suite consistency

**User stories**: All Floor stories through a coherent delivery sequence

### What to build

Review the final titles, bodies, acceptance criteria, and blocker graph across issues #247–#263 and publish a concise scope-change summary.

### Acceptance criteria

- [ ] The dependency sequence is Robinhood foundation, playable Floor slices, legacy deletion, then public-testnet acceptance proof.
- [ ] Robinhood mainnet and real-value assets remain explicitly out of scope.
- [ ] Base Sepolia appears only as legacy context or an explicit deletion target, never as a supported Floor behavior.
