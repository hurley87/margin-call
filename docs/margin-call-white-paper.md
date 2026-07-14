# Margin Call

## A White Paper for Adversarial Markets and Autonomous Judgment

### Abstract

`Margin Call` is a zero-sum PvP trading game set on 1980s Wall Street. You run a trading desk of AI agents. You fund them, configure their mandates, and deploy them into a hostile market of deals written by other players. Some deals are real opportunities. Some are traps. Outcomes are decided mechanically and narrated by GPT-4o-mini. USDC settles through an escrow contract on Base. Trader identity is anchored by ERC-8004 NFTs; the current reputation display is derived from outcome history in Convex. On Base Sepolia, desks can also post test `$BLOW` principal for per-trader operating capacity without changing deal outcomes.

Most AI games frame intelligence as an individual property — build a smarter bot, win more. `Margin Call` starts from a different premise. Markets are not won by isolated intelligence. They are won by institutions: by mandates, memory, risk controls, incentives, timing, and the ability to act under pressure while other actors are actively trying to deceive you.

The result is a game about institutional intelligence under adversarial pressure. A trader does not succeed by thinking harder. A desk succeeds by organizing judgment across roles, constraints, capital, and intervention. The core mechanic is a market where judgment is costly, visible, and continuously tested.

## 1. The Institutional Thesis

The wrong way to think about AI trading games is as a race to build the best isolated agent. That framing is too narrow for markets and too narrow for games.

Real markets are social before they are computational. They reward selective aggression, capital discipline, reputation, role clarity, and the ability to survive contact with other participants. In competitive systems, intelligence is not only a property of a model. It is a property of how decision-making is organized.

`Margin Call` treats that organizational layer as the game itself.

The player is not simply operating a bot. The player is building a desk. Each desk combines:

- traders with distinct mandates
- capital allocated through a constrained bankroll
- approval thresholds for higher-risk moves
- persistent reputation that makes past judgment visible without changing future win rolls
- adversaries who write deals designed to exploit weak judgment

And on the other side, the player is writing deals — authoring scenarios designed to lure other players' traders into costly misjudgments. Every player is simultaneously a desk manager and a deal creator. The two roles are in direct adversarial tension.

This is the central design thesis: intelligence in markets is institutional before it is individual.

## 2. Why This Matters Now

Three developments make this game viable in its current form.

First, language models have reached the threshold where AI agents can participate in repeated decision loops with enough coherence to sustain a strategic identity across dozens or hundreds of trades. A trader can maintain a style, accumulate a history, and produce decisions that meaningfully reflect its configured mandate — not perfectly, but well enough to create divergent outcomes between well-organized and poorly-organized desks. GPT-4o-mini provides the specific balance of capability, speed, and cost that makes a multi-minute autonomous trade cycle practical at fleet scale.

Second, on-chain infrastructure on Ethereum L2s (specifically Base) has matured to the point where USDC settlement, NFT-based agent identity, and token-bound accounts can operate at low cost with sub-second finality. ERC-8004 identity registries are already deployed. ERC-6551 token-bound accounts are a production standard. The building blocks for portable, ownable AI agents with public history exist today in a way they did not two years ago.

Third, the cultural appetite for autonomous agent competition is visible and growing — from on-chain agent arenas to AI-vs-AI trading simulations. The missing element in most of these experiments is stakes. `Margin Call` adds real capital, real adversarial pressure, and durable consequences.

## 3. A Short Scene From the Floor

A trader named Gordon has a strong record, a healthy bankroll, and a reputation for aggressive entries. A new deal appears on the floor: a rumor that a merger will be announced before the bell. The pot is large. The prompt sounds clean. The expected upside is obvious.

Gordon's desk mandate flags the deal as borderline. The approval threshold is triggered. The desk manager pulls up the approval queue and sees the deal details alongside the counterparty's public history — 14 deals created, 9 of which ended in trader wipeouts, a reputation score of 23 out of 100. The desk manager hesitates. The trader's confidence is high, but the counterparty has a documented pattern of baiting high-performing desks into overcommitting. Approval expires. Gordon passes.

Thirty seconds later another trader from a rival desk enters, gets wiped out, and transfers value back into the pot. The deal was a trap.

In `Margin Call`, the dramatic unit is not just the result. It is the chain of judgment around the result: the mandate, the reputation, the intervention, the bluff, the loss, and the visible update to market perception that follows.

## 4. The Three Layers

`Margin Call` has three core layers: the trader, the desk, and the market.

### Trader

A trader is an autonomous agent represented as an ERC-8004 identity NFT—a standard ERC-721 token registered on Base's Identity Registry—with an ERC-6551 token-bound account that serves as its wallet identity. ERC-8004 provides identity and reputation registries, but the current game writes trader identity on-chain and derives displayed performance history from Convex outcomes. Together, these systems give each trader a name, mandate, escrow bankroll, portrait, and evolving track record.

### Desk

A desk is the institution the player builds around one or more traders. The desk manager funds traders, configures mandates and risk tolerance, defines filters and approval thresholds, pauses or resumes activity, and decides when to intervene. The desk is the true strategic unit of play.

### Market

The market is a hostile field of deals authored by other players. Some deals are written to attract and exploit traders. Some are genuine opportunities. Deal creators and trader desks are in explicit adversarial tension. The market records outcomes, compounds reputation, and redistributes capital according to results.

A trader is an agent. A desk is an institution. The market is the environment in which those institutions collide.

## 5. Core Gameplay Loop

The primary loop is simple to understand and deep to optimize:

1. Connect as a desk manager.
2. Mint a trader agent (ERC-8004 NFT with its own wallet).
3. Deposit USDC into the trader's escrow balance.
4. Configure the trader's mandate.
5. Let the trader scan and enter deals autonomously.
6. Optionally post testnet `$BLOW` against that trader for additional floor capacity.
7. Intervene on larger or riskier decisions when thresholds are crossed.
8. Realize profit or loss as outcomes settle.
9. Improve or replace traders based on performance; a supported marketplace remains future work.

### What a Mandate Contains

The mandate is the most important configuration a desk manager controls. It defines the boundaries within which a trader operates autonomously:

- **Risk tolerance** — conservative, moderate, or aggressive, governing how the trader weighs potential loss against potential gain
- **Deal size limits** — minimum and maximum pot sizes the trader will consider
- **Bankroll rules** — maximum percentage of the trader's balance that can be risked on a single deal
- **Approval threshold** — the deal size above which the trader pauses and requests desk manager approval before entering
- **Filters** — optional constraints on deal type, counterparty reputation, or other deal metadata

A well-configured mandate is the difference between a disciplined desk and a reckless one. The mandate does not make the trader smarter. It constrains when and how the trader acts, which in practice matters more.

### Incentive Structure

Within the loop, every role has meaningful incentives:

- **deal creators** earn when traders misjudge risk — the pot grows as losing traders feed capital into it
- **traders** earn when they identify favorable opportunities and extract value from deal pots
- **desk managers** earn by designing better institutions around traders — mandates, risk controls, and intervention timing
- **the platform** earns through a 5% creation fee on deal pots and a 10% rake on trader winnings

Because the game is zero-sum, performance has consequences. Capital moves from one side of a judgment error to another. A desk cannot win without someone else losing.

## 6. How Deals Work

Deals are the other half of the game. While desk management is about organizing judgment, deal creation is about weaponizing narrative.

### Creating a Deal

Any desk manager can create a deal by calling `createDeal` on the escrow contract. A deal consists of:

- **A prompt** — a written scenario that describes the opportunity. This is the bait. Good prompts sound plausible and exploit common patterns of agent overconfidence. Bad prompts are transparent and get ignored.
- **A pot** — USDC deposited into the escrow contract. A 5% creation fee is deducted and retained by the platform. The remaining pot is what traders compete over.
- **An entry cost** — the minimum balance a trader must hold in escrow to enter. This sets the stakes.
- **A max extraction amount** — 25% of the net starting pot, frozen when the deal is created. Later losses may grow the live pot but do not raise this ceiling.

### Deal Dynamics

Deals are not one-shot events. A deal sits open on the floor until the creator closes it or the pot is depleted. Multiple traders can enter the same deal sequentially. Each entry is resolved mechanically in code, then narrated by GPT-4o-mini—one trader might win, the next might lose, and a third might get wiped out entirely.

Win and loss magnitudes are sized from entry cost. Gross wins range from roughly 30% to 100% of stake before rake; losses range from roughly 70% to 100%. The heavier average loss gives deal creators a house edge. When a trader loses, value moves from the trader's escrow balance into the deal pot. When a trader wins, gross value leaves the pot, 10% rake goes to platform fees, and the remainder credits the trader.

This creates a dynamic where deal creators are not betting against any single trader. They are designing scenarios that exploit systematic weaknesses across many traders. The best deal creators study which mandates are common, which reputation levels are overconfident, and which prompt patterns reliably trigger bad judgment.

### Prompt Assistance

Desk managers can request AI-generated deal prompts through the platform. The system suggests three scenario variations based on a theme the player provides, giving deal creators a starting point they can refine.

## 7. Design Principles

The system is built around five principles.

### Zero-Sum Competition

Every economic outcome in the game is adversarial. The market is more legible and more dramatic when gains are clearly funded by losses.

### Persistent Reputation

A trader's history is not decorative metadata. Reputation is visible and economically meaningful as public evidence. The current profile derives score, wins, losses, win rate, wipeouts, and total P&L from outcomes stored in Convex. The identity NFT is on-chain, but outcome reputation is not currently written to the ERC-8004 Reputation Registry. Reputation does not modify mechanical win probability, payouts, or rake.

### Adversarial Prompt Design

Deals are not neutral tasks. They are authored by opponents who may be trying to lure traders into bad decisions. This keeps the game from becoming a passive optimization exercise.

To prevent deal prompts from directly gaming the resolution model, the system separates the financial outcome from the language model entirely. The win/loss decision and magnitude are computed **mechanically in code**—a 50% baseline shifted within fixed bounds by world mood and SEC heat, with randomized win/loss magnitudes sized from entry cost. Gross wins are capped by the creation-frozen extraction amount. GPT-4o-mini never decides the money; it is handed the already-decided result and only dramatizes it into narrative.

### Constrained Autonomy

Traders operate independently, but not without structure. Mandates, bankroll rules, and approval thresholds shape behavior. The game rewards organized autonomy rather than unrestricted automation.

### Selective Human Intervention

The player does not micromanage every action. The player intervenes at consequential moments — when a deal exceeds the approval threshold, when a mandate needs adjustment, when a trader should be paused. The fantasy is not "play instead of the agent." It is "govern the institution the agent belongs to."

## 8. System Design

`Margin Call` combines on-chain settlement, persistent agent identity, and server-mediated outcome resolution.

### Escrow Contract

All USDC flows through a dedicated escrow contract on Base. The contract manages:

- deal pots (deposited by deal creators)
- trader escrow balances (deposited by desk managers)
- platform fee accumulation (5% creation fee + 10% rake on winnings)
- fund distribution after outcome resolution

Desk managers fund and withdraw directly against the contract. Deal creators post pots into the same system. The contract is the financial backbone of the game.

### `$BLOW` Capacity And SeatVault

Base Sepolia also has a separate SeatVault for per-trader `$BLOW` principal. The initial policy is:

| Tier          | Active `$BLOW` | Cycle interval | Maximum unresolved entries |
| ------------- | -------------: | -------------: | -------------------------: |
| Gallery       |              0 |     10 minutes |                          1 |
| Seat          |         10,000 |      5 minutes |                          1 |
| Corner Office |         50,000 |      5 minutes |                          2 |

**Stake affects capacity, never outcome probability.** The vault never holds USDC and has no reward, yield, slashing, fee-discount, revival, or payout path. Only the trader's current escrow depositor can add principal. Initiating an unstake removes capacity immediately; the original staker can recover pending principal after the 24-hour cooldown even if the depositor changes.

The active vault's on-chain `tierOf(traderId)` is authoritative. Convex indexes and reconciles state for reactive display, while scheduler reads fail closed to Gallery when the chain or configuration cannot prove a higher tier.

### Settlement Flow

The end-to-end flow for a single deal entry:

1. **Trader evaluates** — the agent runtime scans open deals, filters against mandate and bankroll rules, selects the best eligible deal.
2. **Approval check** — if the deal exceeds the configured threshold, the workflow pauses and waits for desk manager approval. If approval expires or is rejected, the trader passes.
3. **Capacity check** — the scheduler enforces the authoritative Gallery, Seat, or Corner Office unresolved-entry limit. Stake is not passed into selection or outcome code.
4. **Outcome decision** — the runtime decides win/loss and magnitude mechanically from market conditions and entry cost. GPT-4o-mini receives the decided result plus narrative context and returns only the story and asset changes.
5. **Validation** — gross winnings cannot exceed the deal's creation-frozen extraction amount, losses cannot exceed entry cost, and wipeout is derived from the resulting balance.
6. **On-chain settlement** — the server calls `resolveEntry` on the escrow contract, which distributes winnings from pot to trader minus rake, or losses from trader to pot.
7. **Reputation update** — Convex records the outcome and the UI derives public game history from it; that history does not alter future win rolls.
8. **State sync** — the outcome is committed to Convex for reactive reads, activity, and later narrative context.

### Source of Truth

The escrow contract on Base is the source of truth for all financial state: balances, deal pots, and fee accumulation. Convex holds the working game state — traders, deals, outcomes, reputation, wire dispatches — and serves it reactively to the UI. If the two ever diverge on a financial fact, the contract state takes precedence. The application layer indexes on-chain events to keep working state consistent.

### Trader Identity and Reputation

Each trader is represented as an ERC-8004 identity NFT. That NFT anchors on-chain identity, and an ERC-6551 token-bound account serves as the trader's wallet identity. After outcomes resolve, Convex stores the result and the UI derives score, wins, losses, win rate, wipeouts, and total P&L. Writing those outcomes to the ERC-8004 Reputation Registry is future integration work, not current behavior.

Traders are not entries in a private database. They are portable units of identity with visible market history that anyone can verify.

### Application Layer

The application layer is built with Next.js and Convex, plus a CDP-managed operator wallet for settlement:

- Next.js provides the interface, API routes, and application shell
- Convex stores working state and serves it reactively for fast reads, realtime updates, and prompt construction
- Convex scheduled actions run the agent runtime—a one-minute heartbeat fans out per-trader cycles, with five- or ten-minute eligibility based on floor capacity
- Deal outcomes are decided mechanically; GPT-4o-mini narrates them in structured form, and the market Wire is generated by GPT-5-mini
- The agent's deal entry is authenticated with a SIWA-signed HTTP call to the application's deal-entry endpoint, which records a verified entry before resolution proceeds

The server does not replace the market. It coordinates the runtime, validates outputs, settles outcomes through the contract, and records the resulting state back into the game.

### Trading Hours

The market follows real NYSE hours: Monday through Friday, 9:30am to 4:00pm Eastern, with normal daylight-savings handling. Outside those hours, the heartbeat does not spawn new cycles, no new deals are entered, and the wire stops dropping new dispatches. A short close grace window allows settlements already in flight to finish cleanly so nothing settles in limbo.

Trading hours are enforced at multiple boundaries — trader creation, deal entry, agent cycle, and wire generation — so a single misbehaving caller cannot bypass the bell.

### The Wire

The application also runs a narrative engine that publishes one dispatch each hour at :30 during trading hours. An hourly poll records verified price and volume signals for a registered roster of Base tokens. The generator ranks those company moves against real game events and a quiet-tape fallback, then selects one lead. The previous lead company cannot lead the next slot.

Every number in the dispatch must come from the verified tape or recorded game event. Failed price reads degrade to other material rather than fabricated figures. Desks can create deals directly from a dispatch, preserving the source headline with the resulting deal.

The wire is not decoration. It is part of the game state that shapes which deals appear and how traders read them.

## 9. How a Trader Acts

Each active trader runs through a repeating cycle:

1. Scan open deals from the market.
2. Filter against mandate and bankroll rules.
3. Select the best eligible opportunity.
4. Pause for approval if the deal exceeds the configured threshold.
5. Decide the outcome mechanically (market-modulated win probability + capped magnitude).
6. Hand the decided result, deal prompt, balance, assets, and reputation to GPT-4o-mini, which returns the narrative and asset changes.
7. Settle the result on-chain through the escrow contract.
8. Update reputation, activity logs, and mirrored state.
9. Wait for the next cycle window (a few minutes), then repeat — only while the market is open.

### Assets

Traders can carry assets—items with narrative and monetary value, such as insider tips, industry contacts, or regulatory immunity. Assets are gained and lost through deal outcomes and contribute to displayed trader value. Inventory informs eligible-deal ranking and gives GPT-4o-mini narrative context, but it does not modify the mechanical win roll. Assets add a layer of inventory management without creating an unbounded probability advantage.

### Multiple Traders in the Same Deal

When multiple traders enter the same deal, each entry is resolved independently. Trader A might win, Trader B might lose, and Trader C might get wiped out — all on the same deal. Each resolution uses the trader's own context (balance, reputation, assets) and a fresh random seed. The deal pot adjusts after each entry: losses grow the pot, wins shrink it. This means the order of entry matters — early entries face a smaller pot with higher risk, while later entries may face a larger pot but also signal that the deal has already claimed victims.

## 10. Economy and Incentives

`Margin Call` is designed so that game identity, financial outcomes, and market status reinforce one another.

### Deal Economics

When a player creates a deal, they fund the pot in USDC. A 5% creation fee is deducted and retained by the platform. The remaining pot sits on the floor and attracts traders. When traders win, a 10% rake is taken from winnings. When traders lose, the loss feeds back into the pot.

A deal creator profits by closing a deal whose pot has grown — meaning the deal attracted more losing entries than winning ones. A deal creator loses when traders extract more value than the pot started with. The minimum viable deal requires enough USDC to attract traders while absorbing the creation fee.

### Trader Value

A trader's displayed standing is more than its current balance. Desks can evaluate:

- win-loss history
- Convex-derived reputation score and outcome history
- notable assets carried
- the desk's strategy and mandate configuration
- recent performance under pressure

A strong trader can therefore attract more attention than its current capital alone suggests. A wiped-out identity remains on-chain, while its failed performance stays visible in the game record. Pricing that record in a secondary market remains future work.

### Reputation Flywheel

Reputation creates compounding strategic pressure:

- strong performance improves perceived quality and gives desks more evidence to evaluate
- perceived quality could raise future marketplace value
- stronger traders become more attractive targets for trap deals
- failure becomes more expensive, both financially and reputationally

### What Prevents Snowballing

Left unchecked, the reputation flywheel would create a rich-get-richer dynamic. Several forces counteract this:

- **Target painting** — high-reputation traders are visible targets. Deal creators specifically design traps for overconfident, high-performing agents. Success attracts predators.
- **Pot caps** — a single gross win cannot exceed 25% of the net starting pot, frozen when the deal is created.
- **Wipeout severity** — a trader is destroyed only when validated PnL reduces the bankroll to zero. For normal deals, max downside is the entry amount; full-portfolio wipeout deals require explicit deal types and clear warnings.
- **Desk-sibling dedup** — when one trader from a desk enters a deal, the rest of that desk's traders skip the same deal for the next 24 hours. A single hot read cannot chain through a stable of sibling agents.
- **Own-desk block** — traders cannot enter deals created by their own desk's manager. Creating bait for yourself does not work as a self-deal.
- **Deal creator adaptation** — the adversarial meta-game evolves. When a particular mandate configuration becomes dominant, deal creators learn to target it. Strategies that work well decay as the market adapts.

These mechanics do not eliminate advantage. They ensure that advantage creates exposure.

## 11. Trust Model and Constraints

`Margin Call` is not fully trustless, and that is important to state plainly.

### What Is On-Chain

The following are on-chain or directly anchored to on-chain infrastructure:

- trader ownership (ERC-8004 NFT)
- trader identity records (ERC-8004 Identity Registry) and Convex-backed performance history
- escrow balances and deal pots (escrow contract on Base)
- settlement of financial outcomes (`resolveEntry` distributes USDC)

### What Is Server-Resolved

The following depend on the application server and model layer:

- autonomous trade orchestration (Convex scheduled actions)
- GPT-4o-mini outcome generation
- validation and correction of model outputs
- operator-triggered settlement calls
- mirrored game reads and realtime feeds

### What Players Are Trusting

Players are trusting that:

- the operator only settles outcomes according to validated game rules
- model outputs are bounded by defined constraints (25% max extraction, balance caps)
- corrected narratives remain faithful to the actual capped or adjusted settlement
- mirrored off-chain state stays consistent with the on-chain source of truth

### Operator Power and Constraints

The operator (server) holds the key that calls `resolveEntry` on the escrow contract. This is significant power. The constraints around that power:

- the operator key is managed through a Coinbase CDP server wallet — no raw private key stored on the server
- `resolveEntry` can only be called for deals with valid, open status and traders with sufficient balance
- all settlement calls are logged with their inputs (deal ID, trader ID, PnL, rake) and can be audited against the LLM resolution outputs stored in Convex
- a public settlement log (contract events on Base) allows anyone to reconstruct the history of every deal resolution

There is no on-chain dispute mechanism in the initial version. If the operator settles fraudulently, the recourse is reputational — the settlement history is public and auditable. Adding a time-locked dispute window is a planned improvement for a future version.

### Fairness and Abuse Resistance

Several risks need explicit attention as the game evolves:

- **Prompt abuse by deal creators** — mitigated by running deal prompts through a content filter before acceptance, constraining the resolution model's system prompt so that deal text is treated as scenario description (not instruction), and capping financial outcomes regardless of narrative. The deal prompt influences the story, not the math.
- **Operator abuse or opaque settlement** — mitigated by public on-chain settlement logs, auditable LLM inputs/outputs in the database, and CDP-managed operator keys. Future versions may add time-locked settlement with a challenge window.
- **Trader farming or self-dealing across desks** — mitigated by the 5% creation fee and 10% rake, which make wash trading expensive. A player creating deals and entering them with their own traders loses 15% to fees on every cycle.
- **Mismatch between narrative and financial resolution** — mitigated by the correction flow. If validation modifies the financial outcome, a second LLM call rewrites the narrative to match. The financial result is always determined by the constrained resolution, not the narrative.
- **Overclaiming reputation or stake** — neither reputation nor `$BLOW` principal changes the mechanical win probability. Both must remain outside probability, payout, and rake calculations.

These are ongoing design challenges, not solved problems. The trust model must be stated clearly and improved over time.

## 12. Wipeouts, Failure, and Drama

Most game economies protect agents from public failure. `Margin Call` does the opposite.

A trader can be wiped out. When validated PnL reduces the bankroll to zero, the desk loses that operating unit. The narrative can explain the catastrophe, but it cannot directly set wipeout status; the system derives it from the post-trade bankroll. The wipeout becomes part of the trader's permanent on-chain history.

This matters mechanically, economically, and emotionally:

- mechanically, wipeouts enforce discipline and make mandate configuration consequential
- economically, they remove capital from the losing desk and damage any future marketplace value
- narratively, they create the stories players remember and spectators watch

A wiped-out trader cannot be revived or recapitalized. The NFT persists on-chain as a permanent record — a tombstone. The desk manager must mint a new trader to continue playing. This finality is deliberate: it makes risk real and prevents desks from treating wipeouts as temporary setbacks.

## 13. Why On-Chain Identity Matters Here

Many games can simulate AI agents. Fewer can give those agents persistent public identity that could support portable ownership later.

In `Margin Call`, identity is not an ornament. It is part of the strategic economy.

Because traders exist as NFTs with linked reputation:

- performance can outlive the original desk session
- public history cannot be reset inside the application
- future marketplace work has a durable identity primitive to build around

### The Portrait

Each trader is minted with a deterministic portrait derived from its identity. A small set of traits — archetype, scene, signature prop, market moment, lighting, camera angle, apparent age, hairstyle, clothing, accessory — are hashed from the trader's name, mandate, and personality, then rendered through an image model. The same trader always produces the same portrait, and the trait set is captured in the NFT's metadata so the image is reproducible.

Portraits are not stylistic decoration. They give each trader a stable, recognizable face on the floor.

### Marketplace Boundary

Margin Call does not currently ship a marketplace or supported trader-transfer flow. A protocol-level NFT transfer is not documented as transferring a playable desk asset because current control also depends on application ownership, escrow depositor authority, and wallet bindings.

Future marketplace design must explicitly define migration of application control, mandates, escrow deposits, carried assets, approvals, and active or pending `$BLOW` principal. Identity, portrait, and reputation history are the durable parts intended to persist.

## 14. Roadmap

### Phase 1: Core System (Current)

The core product is the web-first game:

- desk managers create and manage traders
- traders operate through an autonomous trade cycle gated by NYSE hours and per-trader Gallery, Seat, or Corner Office capacity
- deals are adversarial and zero-sum
- one verified, price-and-game-driven Wire dispatch drops each hour at :30 and can be used to create a deal
- each trader is minted with a deterministic portrait tied to its identity
- settlement occurs through an escrow contract on Base
- identity persists through ERC-8004 trader NFTs while current performance history is served from Convex outcomes
- testnet `$BLOW` principal grants capacity through a separate SeatVault without changing outcome probability
- MCP and Base MCP integrations let software agents operate non-custodial desks

### Phase 2: Depth and Reliability

Near-term expansion focuses on making the core loop robust:

- richer trader asset and inventory systems
- stronger dashboards with realtime activity views and P&L tracking
- improved approval flows and desk control surfaces
- tighter validation, observability, and operational safeguards
- broader market browsing and trader marketplace context

### Phase 3: Open Access and Agent Integration (In Progress)

Opening the game beyond the web interface:

- **MCP server (shipped)** — compatible agents use SIWE-issued desk keys and a user-controlled Base Account treasury through prepare → approve → confirm
- **direct contract access** — any agent with a wallet can interact with the escrow contract and public API directly
- **automated desk managers** — fully autonomous AI desk managers that create deals, allocate capital, and run multiple traders without human intervention

### Phase 4: Institutional Complexity

The longer horizon, contingent on the core loop proving compelling:

- coordinated desks with specialized roles and internal strategy layers
- richer adversarial meta-game (counter-strategies, deal-type specialization, coalition play)
- expanded reputation systems with more granular on-chain history
- a separately approved Base mainnet launch plan covering the official `$BLOW` address, supply, distribution, liquidity, SeatVault compatibility, and mainnet escrow activation

The current `$BLOW` token is Base Sepolia test infrastructure. It has no promised market value, official mainnet counterpart, or utility beyond capacity. Any expanded token economics must be specified and reviewed before being presented as current behavior.

Each phase depends on the previous one working. The roadmap is sequential, not aspirational.

## 15. Conclusion

`Margin Call` turns AI traders into on-chain actors with memory, reputation, and transferable value. It turns desk management into a strategic practice of constrained autonomy. It turns deals into public tests of perception under adversarial pressure. And it turns every outcome into a visible update to the market's understanding of who can survive the floor.

The game is not about building one flawless machine trader. It is about building a market where intelligence has to organize itself, take risk, get judged, and live with the result.

What makes that interesting is not the AI. It is the institution around the AI — the mandates, the capital discipline, the intervention timing, the willingness to pass on a deal that looks good but smells wrong. That is the game.

If you want to run a desk, the floor is open.
