/**
 * Pure Crash keeper planner: ordered permissionless actions + monitoring alerts.
 * No outcome privilege — finalize never invents plaintext; the executor attests.
 */

/** Mirrors MarginCallCrash.RoundStatus. */
export const KEEPER_ROUND_STATUS = {
  uninitialized: 0,
  open: 1,
  revealRequested: 2,
  finalized: 3,
  expired: 4,
} as const;

export type KeeperRoundStatus =
  (typeof KEEPER_ROUND_STATUS)[keyof typeof KEEPER_ROUND_STATUS];

/** Operational thresholds (tech design §11 + issue #350 defaults). */
export const KEEPER_THRESHOLDS = {
  /** Seconds after lockAt before a ticketed Open round is "delayed reveal". */
  delayedRevealSeconds: 90n,
  /** Alert when vault gross assets fall below this (tUSD 6 decimals). Floor is 10_000. */
  entryFloorAlertAssets: 12_500n * 1_000_000n,
  /** Alert when freeLiquidity falls below this (tUSD 6 decimals). */
  lowFreeLiquidityAssets: 5_000n * 1_000_000n,
  /** Alert when keeper wallet ETH is below this (wei). */
  lowKeeperEthWei: 5_000_000_000_000_000n, // 0.005 ETH
  /** How many prior epochs count as recent demand for session detection. */
  recentDemandLookback: 2n,
} as const;

export type KeeperRoundSnapshot = {
  id: bigint;
  status: number;
  openAt: bigint;
  lockAt: bigint;
  expiresAt: bigint;
  totalMargin: bigint;
};

export type KeeperVaultSnapshot = {
  shareOperationsFrozen: boolean;
  oldestBlockingRound: bigint;
  frozenRoundCount: bigint;
  freeLiquidity: bigint;
  grossAssets: bigint;
  /** expiresAt of the oldest blocking round when known; null if none/unknown. */
  oldestBlockingExpiresAt: bigint | null;
};

export type KeeperSponsorshipSample = {
  failuresInWindow: number;
  spendWeiInWindow: bigint;
  /** When null, spend alerts are skipped. */
  spendBudgetWei: bigint | null;
};

export type KeeperSnapshot = {
  /** Chain time in unix seconds. */
  now: bigint;
  currentRoundId: bigint;
  rounds: readonly KeeperRoundSnapshot[];
  vault: KeeperVaultSnapshot;
  keeperEthWei: bigint;
  /** Operator flag: keep current+next pre-opened during demo/judged sessions. */
  preopenEnabled: boolean;
  sponsorship: KeeperSponsorshipSample | null;
  /** Rounds whose attestation fetch failed on a prior attempt this window. */
  attestationFailures?: readonly bigint[];
};

export type KeeperAction =
  | { type: "expire"; roundId: bigint }
  | { type: "requestReveal"; roundId: bigint }
  | { type: "finalize"; roundId: bigint }
  | { type: "openRound"; roundId: bigint };

export type KeeperAlertKind =
  | "delayed_reveal"
  | "failed_attestation"
  | "expiry_eligibility"
  | "freeze_outliving_expiry"
  | "low_free_liquidity"
  | "entry_floor_approach"
  | "low_keeper_eth"
  | "stale_preopen"
  | "paymaster_failure"
  | "paymaster_spend"
  | "missing_credentials";

export type KeeperAlertSeverity = "info" | "warning" | "critical";

export type KeeperAlert = {
  kind: KeeperAlertKind;
  severity: KeeperAlertSeverity;
  message: string;
  roundId?: bigint;
  fingerprint: string;
};

export type KeeperPlan = {
  actions: KeeperAction[];
  alerts: KeeperAlert[];
  sessionActive: boolean;
};

function roundById(
  rounds: readonly KeeperRoundSnapshot[],
  id: bigint
): KeeperRoundSnapshot | undefined {
  return rounds.find((round) => round.id === id);
}

function isExposed(round: KeeperRoundSnapshot): boolean {
  return round.totalMargin > 0n;
}

/**
 * Active when the operator enables pre-open, or recent onchain demand exists
 * (margin on current or either of the prior two epochs).
 */
export function isKeeperSessionActive(snapshot: KeeperSnapshot): boolean {
  if (snapshot.preopenEnabled) return true;

  const { currentRoundId, rounds } = snapshot;
  const lookback = KEEPER_THRESHOLDS.recentDemandLookback;
  for (let delta = 0n; delta <= lookback; delta++) {
    if (currentRoundId < delta) continue;
    const round = roundById(rounds, currentRoundId - delta);
    if (round && isExposed(round)) return true;
  }
  return false;
}

function alert(
  kind: KeeperAlertKind,
  severity: KeeperAlertSeverity,
  message: string,
  roundId?: bigint
): KeeperAlert {
  const fingerprint =
    roundId === undefined ? kind : `${kind}:${roundId.toString()}`;
  return { kind, severity, message, roundId, fingerprint };
}

/** True when a round can be expired onchain (Open | RevealRequested past expiresAt). */
export function isExpireEligible(
  round: KeeperRoundSnapshot,
  now: bigint
): boolean {
  if (
    round.status !== KEEPER_ROUND_STATUS.open &&
    round.status !== KEEPER_ROUND_STATUS.revealRequested
  ) {
    return false;
  }
  return now >= round.expiresAt;
}

/** True when a ticketed Open round is past lock and before expiry. */
export function isRevealEligible(
  round: KeeperRoundSnapshot,
  now: bigint
): boolean {
  if (round.status !== KEEPER_ROUND_STATUS.open) return false;
  if (!isExposed(round)) return false;
  if (now < round.lockAt) return false;
  if (now >= round.expiresAt) return false;
  return true;
}

/** True when RevealRequested and still before expiry. */
export function isFinalizeEligible(
  round: KeeperRoundSnapshot,
  now: bigint
): boolean {
  if (round.status !== KEEPER_ROUND_STATUS.revealRequested) return false;
  return now < round.expiresAt;
}

/**
 * Classify monitoring alerts from a chain snapshot.
 * Alerts never become settlement authority — callers must not gate txs on them.
 */
export function classifyKeeperAlerts(snapshot: KeeperSnapshot): KeeperAlert[] {
  const alerts: KeeperAlert[] = [];
  const sessionActive = isKeeperSessionActive(snapshot);
  const { now, vault, rounds, currentRoundId } = snapshot;

  for (const round of rounds) {
    if (
      round.status === KEEPER_ROUND_STATUS.open &&
      isExposed(round) &&
      now > round.lockAt + KEEPER_THRESHOLDS.delayedRevealSeconds
    ) {
      alerts.push(
        alert(
          "delayed_reveal",
          "warning",
          `Round ${round.id} still Open ${now - round.lockAt}s after lock`,
          round.id
        )
      );
    }

    if (isExpireEligible(round, now) && isExposed(round)) {
      alerts.push(
        alert(
          "expiry_eligibility",
          "critical",
          `Exposed round ${round.id} is expiry-eligible and should be expired promptly`,
          round.id
        )
      );
    }
  }

  for (const roundId of snapshot.attestationFailures ?? []) {
    alerts.push(
      alert(
        "failed_attestation",
        "warning",
        `Attestation failed for round ${roundId}; finalize will retry`,
        roundId
      )
    );
  }

  if (
    vault.shareOperationsFrozen &&
    vault.oldestBlockingExpiresAt !== null &&
    now > vault.oldestBlockingExpiresAt
  ) {
    alerts.push(
      alert(
        "freeze_outliving_expiry",
        "critical",
        `Share freeze still active after blocking round ${vault.oldestBlockingRound} expiry`,
        vault.oldestBlockingRound
      )
    );
  }

  if (vault.freeLiquidity < KEEPER_THRESHOLDS.lowFreeLiquidityAssets) {
    alerts.push(
      alert(
        "low_free_liquidity",
        "warning",
        `Free liquidity ${vault.freeLiquidity} below ${KEEPER_THRESHOLDS.lowFreeLiquidityAssets}`
      )
    );
  }

  if (vault.grossAssets < KEEPER_THRESHOLDS.entryFloorAlertAssets) {
    alerts.push(
      alert(
        "entry_floor_approach",
        "warning",
        `Gross assets ${vault.grossAssets} approaching 10,000 tUSD entry floor (alert at 12,500)`
      )
    );
  }

  if (snapshot.keeperEthWei < KEEPER_THRESHOLDS.lowKeeperEthWei) {
    alerts.push(
      alert(
        "low_keeper_eth",
        "critical",
        `Keeper wallet ETH ${snapshot.keeperEthWei} below ${KEEPER_THRESHOLDS.lowKeeperEthWei} wei`
      )
    );
  }

  const current = roundById(rounds, currentRoundId);
  if (
    sessionActive &&
    (!current || current.status === KEEPER_ROUND_STATUS.uninitialized)
  ) {
    alerts.push(
      alert(
        "stale_preopen",
        "critical",
        `Active session but epoch ${currentRoundId} is uninitialized — phone-login entry blocked`,
        currentRoundId
      )
    );
  }

  const sponsorship = snapshot.sponsorship;
  if (sponsorship) {
    if (sponsorship.failuresInWindow > 0) {
      alerts.push(
        alert(
          "paymaster_failure",
          "warning",
          `${sponsorship.failuresInWindow} sponsorship failure(s) in monitoring window`
        )
      );
    }
    if (
      sponsorship.spendBudgetWei !== null &&
      sponsorship.spendWeiInWindow > sponsorship.spendBudgetWei
    ) {
      alerts.push(
        alert(
          "paymaster_spend",
          "warning",
          `Sponsorship spend ${sponsorship.spendWeiInWindow} exceeds budget ${sponsorship.spendBudgetWei}`
        )
      );
    }
  }

  return alerts;
}

/**
 * Plan one keeper tick from onchain state.
 * Priority: expire → requestReveal → finalize → pre-open (when session active).
 * Idle (no work, inactive session) yields zero actions.
 */
export function planKeeperTick(snapshot: KeeperSnapshot): KeeperPlan {
  const sessionActive = isKeeperSessionActive(snapshot);
  const actions: KeeperAction[] = [];
  const { now, currentRoundId, rounds } = snapshot;

  const expireCandidates = rounds
    .filter((round) => isExpireEligible(round, now) && isExposed(round))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const round of expireCandidates) {
    actions.push({ type: "expire", roundId: round.id });
  }

  const remaining = rounds.filter(
    (round) => !(isExpireEligible(round, now) && isExposed(round))
  );

  for (const round of [...remaining].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )) {
    if (isRevealEligible(round, now)) {
      actions.push({ type: "requestReveal", roundId: round.id });
    }
  }

  for (const round of [...remaining].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )) {
    if (isFinalizeEligible(round, now)) {
      actions.push({ type: "finalize", roundId: round.id });
    }
  }

  if (sessionActive) {
    const current = roundById(rounds, currentRoundId);
    const nextId = currentRoundId + 1n;
    const next = roundById(rounds, nextId);

    if (!current || current.status === KEEPER_ROUND_STATUS.uninitialized) {
      actions.push({ type: "openRound", roundId: currentRoundId });
    }
    if (!next || next.status === KEEPER_ROUND_STATUS.uninitialized) {
      actions.push({ type: "openRound", roundId: nextId });
    }
  }

  return {
    actions,
    alerts: classifyKeeperAlerts(snapshot),
    sessionActive,
  };
}

/** Build a missing-credentials alert for the executor when env is incomplete. */
export function missingCredentialsAlert(detail: string): KeeperAlert {
  return alert(
    "missing_credentials",
    "critical",
    `Keeper credentials missing or invalid: ${detail}`
  );
}
