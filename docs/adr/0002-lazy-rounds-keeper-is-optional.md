# Rounds are created lazily; the keeper is an accelerator, not an authority

Rounds live on a fixed 60-second epoch grid but are materialized on demand: the first entry of an epoch creates the round and its encrypted randomness handle in the same transaction (before the ticket is accepted), with permissionless `openRound` available to pre-open rounds during demo sessions. We chose this over a 24/7 keeper heartbeat — roughly 1,440 mostly-empty round lifecycles per day — because the cost of always-on was operational rather than code: with lazy creation and fully permissionless transitions, the keeper collapses into an optional cron that no-ops when idle, and the game stays playable and settleable if it dies entirely.

## Consequences

- The confidentiality guarantee is worded "the handle is created before any ticket is accepted" rather than "before entries open"; pre-opening restores the stronger phrasing during judged sessions.
- The first entrant of an epoch pays the round-creation gas; the interface discloses this honestly.
- Rounds must be expirable from `Open` as well as `RevealRequested`, so no round is ever stranded by a missing reveal request.
