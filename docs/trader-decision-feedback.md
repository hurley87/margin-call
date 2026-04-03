# Trader Decision Feedback

> Future feature exploration for letting desk managers rate whether a trader's decision was a good call or a bad call, then use that signal to tune future deal selection.

## Summary

After a deal resolves, the desk manager can review the outcome and leave structured feedback about the quality of the trader's decision.

This is not meant to change settlement, rewrite history, or replace public reputation. It is a desk-local coaching signal:

- "Good call" or "Bad call"
- A structured reason such as `fit_mandate`, `too_risky`, or `ignored_trap_signal`
- An optional short note for the desk's own history

The goal is to make traders feel coachable over time without turning the game into a spreadsheet of manual micromanagement.

---

## Why This Fits The Game

Today, desk managers can:

- Configure the trader's mandate
- Set approval thresholds for larger entries
- Review deal outcomes after the fact

A feedback loop extends that fantasy naturally. Instead of only funding and configuring a trader, the desk manager can also coach judgment:

- Reward disciplined, mandate-aligned plays
- Penalize reckless entries, even if they happened to win
- Push a trader toward a more cautious or more aggressive style over time

This creates a stronger "desk manager" identity while preserving the autonomous agent loop.

---

## Recommended Product Shape

### Post-outcome decision review

The simplest useful version lives on the trader detail page, attached to each resolved outcome.

Example controls:

- `Good call`
- `Bad call`
- Reason chips:
  - `fit_mandate`
  - `great_asymmetry`
  - `good_creator_read`
  - `too_risky`
  - `overpaid_entry`
  - `ignored_trap_signal`
  - `bad_timing`
  - `lucky_not_smart`
- Optional note (small text field)

This is intentionally about decision quality, not just whether the trade made money.

### Why structured feedback is better than stars

Simple star ratings are easy to ship, but they mostly measure emotion after the outcome. A reckless win gets praise; a smart loss gets punished.

Structured reasons are more useful because they can be summarized and fed back into the trader's future evaluation prompt without exposing the model to raw user text.

---

## Design Principles

### 1. Keep it off-chain

This signal should stay in Supabase, not in the escrow contract or the permanent ERC-8004 reputation record.

Reasons:

- It is subjective and desk-specific
- It may change over time as a manager refines strategy
- It should not permanently alter public market value the way outcome history does

### 2. Keep it desk-local

One desk manager's preferences should not become global truth.

If a trader NFT changes hands, the new owner should inherit:

- The actual win/loss/reputation history

But not necessarily:

- The old owner's private coaching style

### 3. Never affect settlement

Decision feedback should not:

- Change deal outcomes
- Rewrite narratives
- Alter escrow balances
- Modify on-chain reputation retroactively

It only influences future decision-making and desk analytics.

### 4. Never pass raw comments directly to the model

Optional notes are useful for the player, but they should not be inserted verbatim into prompts.

Instead, the server should summarize recent structured feedback into safe signals such as:

- recent disliked patterns
- recent liked patterns
- current risk bias (`more_cautious`, `neutral`, `more_aggressive`)

---

## Gameplay Impact

This feature would strengthen several loops:

### Coach your trader

The trader feels less like a black box and more like a recruit you can shape over time.

### Distinguish desks

Two managers with the same starting trader could coach them differently:

- One desk trains a ruthless opportunist
- Another trains a cautious preservation-first survivor

### Better post-game review

Big wins and wipeouts become teachable moments instead of just spectacle.

### More meaningful ownership

Owning a trader becomes more than funding bankroll and setting filters. You are building a style.

---

## Suggested Data Model

Use a dedicated table such as `decision_feedback` rather than adding columns directly to `deal_outcomes`.

High-level shape:

```sql
create table decision_feedback (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references traders(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  outcome_id uuid references deal_outcomes(id) on delete cascade,
  desk_manager_id uuid not null references desk_managers(id) on delete cascade,
  stage text not null check (stage in ('outcome_review', 'approval_review')),
  score smallint not null check (score between -2 and 2),
  reason_code text not null,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (desk_manager_id, outcome_id, stage)
);
```

Reasons to keep it separate:

- Better audit trail
- Easier to extend later
- Cleaner support for multiple feedback stages
- Cleaner query and realtime patterns

---

## How It Should Influence The Agent

The best first integration point is the trader's deal-evaluation prompt.

Instead of injecting raw comments, summarize recent desk feedback into a compact preference block:

- total recent ratings
- average score over recent outcomes
- most common negative reasons
- most common positive reasons
- derived risk bias

Example:

```txt
Desk preference drift: more_cautious
Recently disliked: overpaid_entry, ignored_trap_signal
Recently liked: fit_mandate, good_creator_read
```

That gives the evaluator another signal when ranking deals, alongside:

- mandate constraints
- personality
- pot/entry ratio
- creator trap history
- resolved win/loss/wipeout counts

---

## Rollout Path

### Phase 1

Add post-outcome feedback UI to the trader detail page and store structured feedback off-chain.

### Phase 2

Show desk-facing analytics such as:

- common mistakes
- current risk drift
- recent "good call" vs "bad call" split

### Phase 3

Feed summarized feedback into the deal evaluation prompt so traders gradually adapt to the desk's preferences.

### Phase 4

Optionally add approval-stage feedback:

- "I approved this because..."
- "I rejected this because..."

That may become even cleaner training data than after-the-fact outcome review.

---

## Naming Note

The codebase already uses the word `feedback` for ERC-8004 reputation submissions. To avoid confusion, this feature should be referred to in product and schema language as `decision feedback` or `desk coaching`, not generic `feedback`.

---

## Open Questions

Questions worth revisiting before implementation:

1. Should feedback be editable, or append-only?
2. How much weight should recent feedback have relative to long-term mandate and personality?
3. Should feedback stay with the desk manager only, or partially transfer when a trader NFT is sold?
4. Should approval-stage rationale be part of the same system or a separate table?
5. Should the game surface recommended mandate changes when repeated feedback shows the trader is too aggressive or too passive?
