import {
  encodeFunctionData,
  getAbiItem,
  isAddress,
  parseAbi,
  zeroAddress,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import {
  getBaseSepoliaContractCodeUrl,
  getBaseSepoliaTransactionUrl,
} from "./base-sepolia-explorer";

export const marginCallCrashAbi = parseAbi([
  "function epochOrigin() view returns (uint64)",
  "function currentRoundId() view returns (uint256)",
  "function roundTimes(uint256 roundId) view returns (uint64 openAt, uint64 lockAt, uint64 expiresAt)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function getTicket(uint256 ticketId) view returns ((uint256 id, address player, uint256 roundId, uint256 margin, uint256 leverageBps, uint256 reservedPayout, bool settled, bool claimed))",
  "function getTicketId(uint256 roundId, address player) view returns (uint256)",
  "function enter(uint256 roundId, uint256 margin, uint256 leverageBps) payable",
  "function requestReveal(uint256 roundId)",
  "function finalizeRound(uint256 roundId, uint256 plaintext, bytes[] signatures)",
  "function claim(uint256 ticketId, address receiver)",
  "function settleLoss(uint256 ticketId)",
  "function expireRound(uint256 roundId)",
  "function refund(uint256 ticketId, address receiver)",
  "event RoundOpened(uint256 indexed roundId, address indexed opener, bytes32 crashRandom, uint64 openAt, uint64 lockAt, uint64 expiresAt)",
  "event TicketEntered(uint256 indexed roundId, uint256 indexed ticketId, address indexed player, uint256 margin, uint256 leverageBps, uint256 reservedPayout)",
  "event RevealRequested(uint256 indexed roundId, bytes32 crashRandom)",
  "event RoundFinalized(uint256 indexed roundId, bytes32 crashRandom, uint256 crashPointBps)",
  "event RoundExpired(uint256 indexed roundId)",
  "event TicketClaimed(uint256 indexed roundId, uint256 indexed ticketId, address indexed player, address receiver, uint256 payout)",
  "event TicketLossSettled(uint256 indexed roundId, uint256 indexed ticketId, address indexed player)",
  "event TicketRefunded(uint256 indexed roundId, uint256 indexed ticketId, address indexed player, address receiver, uint256 margin)",
]);

/** One Desk Dollar in 6-decimal base units. */
export const ONE_TUSD = 1_000_000n;
/** Basis-point denominator shared by leverage and Crash Point math. */
export const LEVERAGE_SCALE = 10_000n;

/** Supported entry margins in tUSD base units (6 decimals). */
export const ENTRY_MARGINS_TUSD = [
  ONE_TUSD,
  5n * ONE_TUSD,
  10n * ONE_TUSD,
] as const;

/** Supported Arcade Leverage tiers in basis points. */
export const ENTRY_LEVERAGE_TIERS_BPS = [
  12_500n,
  15_000n,
  20_000n,
  30_000n,
  50_000n,
  100_000n,
] as const;

/** One-time bounded tUSD approval offered by the entry UI. */
export const BOUNDED_ENTRY_ALLOWANCE_TUSD = 1_000n * ONE_TUSD;

/** Stop offering entry this many seconds before onchain lock. */
export const ENTRY_CUTOFF_SECONDS = 5;

const roundOpenedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundOpened",
});
const revealRequestedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RevealRequested",
});
const roundFinalizedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundFinalized",
});
const roundExpiredEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundExpired",
});
const ticketEnteredEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "TicketEntered",
});
const ticketClaimedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "TicketClaimed",
});
const ticketRefundedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "TicketRefunded",
});

// A round can be initialized at most one 60-second epoch early. A 512-block
// window provides ample Base Sepolia reorg/block-time margin without an
// ever-growing deployment-to-latest scan on every client poll.
const ROUND_EVENT_LOOKBACK_BLOCKS = 512n;
/** 1.00x in basis points — the floor of the displayable Crash Point range. */
export const ONE_X_BPS = 10_000n;
/** 10.00x in basis points — the cap of the displayable Crash Point range. */
export const MAX_CRASH_POINT_BPS = 100_000n;

/** Base Sepolia Inco Lightning singleton from @inco/lightning@1.0.2. */
export const BASE_SEPOLIA_INCO_LIGHTNING_ADDRESS =
  "0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624" as const satisfies Address;

export type MarginCallCrashConfig = {
  address: Address;
  deploymentBlock: bigint;
};

export type CrashRoundStatus = 0 | 1 | 2 | 3 | 4;

export type CrashRound = {
  id: bigint;
  openAt: bigint;
  lockAt: bigint;
  expiresAt: bigint;
  crashRandom: Hex;
  crashPointBps: bigint;
  totalMargin: bigint;
  reservedPayout: bigint;
  status: CrashRoundStatus;
};

export type CrashRoundPhase =
  | "prelaunch"
  | "uninitialized"
  | "open"
  | "locked"
  | "reveal-requested"
  | "expired-eligible"
  | "finalized"
  | "expired";

export type CrashRoundLifecycleUrls = {
  openingTransactionUrl: string | null;
  revealTransactionUrl: string | null;
  finalizeTransactionUrl: string | null;
  expireTransactionUrl: string | null;
  gameContractUrl: string;
  incoContractUrl: string;
};

/** Honest history labels — never invent a multiplier for delayed/expired/empty. */
export type RoundHistoryState =
  "open" | "delayed" | "empty" | "finalized" | "expired";

export type RoundHistoryItem = {
  round: CrashRound;
  phase: CrashRoundPhase;
  historyState: RoundHistoryState;
  displayCrashPoint: string | null;
};

export type RoundHistoryDetail = RoundHistoryItem &
  CrashRoundLifecycleUrls & {
    ticketEnteredTransactionUrls: string[];
    ticketClaimedTransactionUrls: string[];
    ticketRefundedTransactionUrls: string[];
  };

export type PlayerTicketHistoryItem = {
  ticket: CrashTicket;
  round: CrashRound;
  phase: CrashRoundPhase;
  outcome: TicketOutcome;
  displayCrashPoint: string | null;
  payout: bigint | null;
  /** Which amount the row should display for this outcome. */
  amountKind: "refund" | "payout" | "reserved";
  displayAmount: bigint;
  canClaim: boolean;
  canSettle: boolean;
  canVerify: boolean;
  canExpire: boolean;
  canRefund: boolean;
};

export const ROUND_STATUS = {
  uninitialized: 0,
  open: 1,
  revealRequested: 2,
  finalized: 3,
  expired: 4,
} as const satisfies Record<string, CrashRoundStatus>;

/** How many prior epochs to surface in global history and ambiance replay. */
export const GLOBAL_HISTORY_LOOKBACK_ROUNDS = 20;

/** One public TicketEntered row for the live ticket tape / tier pops. */
export type TicketTapeEntry = {
  ticketId: bigint;
  player: Address;
  margin: bigint;
  leverageBps: bigint;
  reservedPayout: bigint;
  transactionHash: Hash | null;
};

/** Per-tier aggregate of committed tickets in a round. */
export type TierExposure = {
  leverageBps: bigint;
  ticketCount: number;
  totalMargin: bigint;
  reservedPayout: bigint;
};

/** Ticket tape + tier aggregates for one round. */
export type RoundTicketTape = {
  roundId: bigint;
  entries: TicketTapeEntry[];
  tiers: TierExposure[];
};

/** A finalized round eligible for dramatized replay / ambiance. */
export type FinalizedReplayRound = {
  round: CrashRound;
  displayCrashPoint: string;
};

type RoundLifecycleEvent =
  | typeof roundOpenedEvent
  | typeof revealRequestedEvent
  | typeof roundFinalizedEvent
  | typeof roundExpiredEvent;

type LifecycleEventKey = "opening" | "reveal" | "finalize" | "expire";

// epochOrigin is immutable on-chain and lifecycle transactions of a round can
// never change once observed, so neither needs to be re-fetched on every poll.
// A stored null marks an event that can no longer occur for the round (e.g. a
// reveal never requested before expiry); absent keys are looked up again.
const epochOriginCache = new Map<Address, bigint>();
const lifecycleTransactionCache = new Map<
  string,
  Partial<Record<LifecycleEventKey, Hash | null>>
>();
/** Finalized-at timestamps are immutable once observed. */
const finalizeTimestampCache = new Map<string, bigint>();
/** Block number of RoundFinalized, shared with the lifecycle hash lookup. */
const finalizeBlockNumberCache = new Map<string, bigint>();
// TicketEntered rows are append-only, so each poll only scans blocks past the
// previous watermark instead of the full deployment-to-latest range. A reorged
// entry can linger on the decorative tape until reload; settlement never reads it.
const ticketTapeCache = new Map<
  string,
  { lastScannedBlock: bigint; entries: TicketTapeEntry[] }
>();

/** Public configuration only. Static env references allow Next.js client inlining. */
export function getMarginCallCrashConfig(): MarginCallCrashConfig | null {
  const address = process.env.NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS;
  const deploymentBlock = parseDeploymentBlock(
    process.env.NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK
  );

  if (!address || !isAddress(address) || deploymentBlock === null) return null;
  return { address, deploymentBlock };
}

export function deriveRoundPhase(
  round: CrashRound,
  chainTimestamp: bigint
): CrashRoundPhase {
  if (round.status === ROUND_STATUS.uninitialized) {
    return chainTimestamp < round.openAt ? "prelaunch" : "uninitialized";
  }
  if (round.status === ROUND_STATUS.finalized) return "finalized";
  if (round.status === ROUND_STATUS.expired) return "expired";
  if (chainTimestamp >= round.expiresAt) return "expired-eligible";
  if (round.status === ROUND_STATUS.revealRequested) return "reveal-requested";
  return chainTimestamp < round.lockAt ? "open" : "locked";
}

export function getRoundCountdownSeconds(
  round: CrashRound,
  chainTimestamp: bigint
) {
  if (deriveRoundPhase(round, chainTimestamp) !== "open") return 0;
  return Number(round.lockAt - chainTimestamp);
}

/** Phases before entry locks — the round can still accept (or start accepting) Tickets. */
export function isPreLockPhase(
  phase: CrashRoundPhase
): phase is "open" | "prelaunch" | "uninitialized" {
  return phase === "open" || phase === "prelaunch" || phase === "uninitialized";
}

export type CrashTicket = {
  id: bigint;
  player: Address;
  roundId: bigint;
  margin: bigint;
  leverageBps: bigint;
  reservedPayout: bigint;
  settled: boolean;
  claimed: boolean;
};

export function computeMaximumPayout(margin: bigint, leverageBps: bigint) {
  return (margin * leverageBps) / LEVERAGE_SCALE;
}

/** Equality wins: the ticket pays when leverage is at or below the Crash Point. */
export function isWinningTicket(leverageBps: bigint, crashPointBps: bigint) {
  return leverageBps <= crashPointBps;
}

export function computeTicketPayout(
  margin: bigint,
  leverageBps: bigint,
  crashPointBps: bigint
) {
  return isWinningTicket(leverageBps, crashPointBps)
    ? computeMaximumPayout(margin, leverageBps)
    : 0n;
}

/** Mirrors MarginCallCrash._crashPointFromRandom: 99,000,000 / (10,000 - r), capped at 10.00x. */
export function computeCrashPointBps(crashRandom: bigint): bigint {
  const raw = 99_000_000n / (10_000n - crashRandom);
  return raw > MAX_CRASH_POINT_BPS ? MAX_CRASH_POINT_BPS : raw;
}

export type TicketOutcome =
  | "pending"
  | "won"
  | "lost"
  | "settled-win"
  | "settled-loss"
  | "refundable"
  | "refunded";

export function deriveTicketOutcome(
  ticket: CrashTicket,
  round: CrashRound | null
): TicketOutcome {
  if (ticket.settled) {
    if (ticket.claimed) return "settled-win";
    if (round?.status === ROUND_STATUS.expired) return "refunded";
    return "settled-loss";
  }
  if (!round) return "pending";
  if (round.status === ROUND_STATUS.expired) return "refundable";
  if (round.status !== ROUND_STATUS.finalized) return "pending";
  return isWinningTicket(ticket.leverageBps, round.crashPointBps)
    ? "won"
    : "lost";
}

/** True when an unsettled ticket belongs to an expired round and can be refunded. */
export function isRefundable(ticket: CrashTicket, round: CrashRound | null) {
  return deriveTicketOutcome(ticket, round) === "refundable";
}

/** True when a round may be permissionlessly marked expired. */
export function canExpireRound(round: CrashRound, chainTimestamp: bigint) {
  return deriveRoundPhase(round, chainTimestamp) === "expired-eligible";
}

/**
 * Routes a recovered ticket to its resolution surface: the expiry-refund UI
 * owns expiry-eligible, expired, and refunded tickets; settlement owns the
 * rest. Both surfaces consult this so neither or both can claim a ticket.
 */
export function isExpiryRefundTicket(
  phase: CrashRoundPhase | null,
  outcome: TicketOutcome | null
) {
  return (
    phase === "expired" ||
    phase === "expired-eligible" ||
    outcome === "refundable" ||
    outcome === "refunded"
  );
}

/** Renders a hundredths-scaled value as "W.FF" (e.g. 125 → "1.25"). */
export function formatHundredths(hundredths: bigint): string {
  const whole = hundredths / 100n;
  const fraction = hundredths % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

export function formatLeverageBps(leverageBps: bigint): string {
  return `${formatHundredths(leverageBps / 100n)}x`;
}

/**
 * Entry is offered only into an initialized open round with more than the UI
 * cutoff remaining before lock. Embedded wallets never create rounds.
 */
export function canOfferEntry(
  phase: CrashRoundPhase,
  countdownSeconds: number
) {
  return phase === "open" && countdownSeconds > ENTRY_CUTOFF_SECONDS;
}

/**
 * Groups TicketEntered rows into one TierExposure per Arcade Leverage tier.
 * Sums the onchain reservedPayout to avoid integer-division drift vs the vault.
 * Unknown leverage values are skipped (contracts reject them at entry).
 */
export function aggregateTierExposure(
  entries: ReadonlyArray<
    Pick<TicketTapeEntry, "leverageBps" | "margin" | "reservedPayout">
  >
): TierExposure[] {
  const byTier = new Map<bigint, TierExposure>();
  for (const tier of ENTRY_LEVERAGE_TIERS_BPS) {
    byTier.set(tier, {
      leverageBps: tier,
      ticketCount: 0,
      totalMargin: 0n,
      reservedPayout: 0n,
    });
  }

  for (const entry of entries) {
    const bucket = byTier.get(entry.leverageBps);
    if (!bucket) continue;
    bucket.ticketCount += 1;
    bucket.totalMargin += entry.margin;
    bucket.reservedPayout += entry.reservedPayout;
  }

  return ENTRY_LEVERAGE_TIERS_BPS.map((tier) => byTier.get(tier)!);
}

export type CrashCallRequest = { to: Address; data: Hex };

export function revealRequest(to: Address, roundId: bigint): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "requestReveal",
      args: [roundId],
    }) as Hex,
  };
}

export function finalizeRequest(
  to: Address,
  roundId: bigint,
  plaintext: bigint,
  signatures: readonly Hex[]
): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "finalizeRound",
      args: [roundId, plaintext, signatures],
    }) as Hex,
  };
}

export function claimRequest(to: Address, ticketId: bigint): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "claim",
      args: [ticketId, zeroAddress],
    }) as Hex,
  };
}

export function settleLossRequest(
  to: Address,
  ticketId: bigint
): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "settleLoss",
      args: [ticketId],
    }) as Hex,
  };
}

export function expireRequest(to: Address, roundId: bigint): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "expireRound",
      args: [roundId],
    }) as Hex,
  };
}

export function refundRequest(to: Address, ticketId: bigint): CrashCallRequest {
  return {
    to,
    data: encodeFunctionData({
      abi: marginCallCrashAbi,
      functionName: "refund",
      args: [ticketId, zeroAddress],
    }) as Hex,
  };
}

export async function readPlayerTicket(
  address: Address,
  roundId: bigint,
  player: Address
): Promise<CrashTicket | null> {
  const ticketId = await baseSepoliaPublicClient.readContract({
    address,
    abi: marginCallCrashAbi,
    functionName: "getTicketId",
    args: [roundId, player],
  });
  if (ticketId === 0n) return null;

  const ticket = await baseSepoliaPublicClient.readContract({
    address,
    abi: marginCallCrashAbi,
    functionName: "getTicket",
    args: [ticketId],
  });
  return ticket;
}

/** How many prior epochs to scan when recovering a returning player's ticket. */
export const PLAYER_TICKET_LOOKBACK_ROUNDS = 20;

/** Round ids in the lookback window ending at `currentRoundId`, newest first. */
function lookbackRoundIds(currentRoundId: bigint, lookback: number): bigint[] {
  const start =
    currentRoundId > BigInt(lookback) ? currentRoundId - BigInt(lookback) : 0n;
  const roundIds: bigint[] = [];
  for (let roundId = currentRoundId; roundId >= start; roundId--) {
    roundIds.push(roundId);
  }
  return roundIds;
}

/**
 * Loads every ticket the player holds in the lookback window, newest first.
 * Concurrent reads let the client's multicall batching collapse the scan
 * into a couple of RPC requests instead of one round trip per round.
 */
async function scanPlayerTickets(
  address: Address,
  currentRoundId: bigint,
  player: Address,
  blockNumber?: bigint
): Promise<Array<{ ticket: CrashTicket; round: CrashRound }>> {
  const roundIds = lookbackRoundIds(
    currentRoundId,
    PLAYER_TICKET_LOOKBACK_ROUNDS
  );
  const ticketIds = await Promise.all(
    roundIds.map((roundId) =>
      baseSepoliaPublicClient.readContract({
        address,
        abi: marginCallCrashAbi,
        functionName: "getTicketId",
        args: [roundId, player],
        blockNumber,
      })
    )
  );
  return Promise.all(
    roundIds.flatMap((roundId, index) => {
      const ticketId = ticketIds[index];
      if (ticketId === 0n) return [];
      return [
        Promise.all([
          baseSepoliaPublicClient.readContract({
            address,
            abi: marginCallCrashAbi,
            functionName: "getTicket",
            args: [ticketId],
            blockNumber,
          }),
          baseSepoliaPublicClient.readContract({
            address,
            abi: marginCallCrashAbi,
            functionName: "getRound",
            args: [roundId],
            blockNumber,
          }),
        ]).then(([ticket, round]) => ({
          ticket,
          round: { ...round, status: normalizeRoundStatus(round.status) },
        })),
      ];
    })
  );
}

/**
 * Finds the player's most recent unsettled ticket within the lookback window,
 * then their most recent settled ticket if none remain open. Lets a judge return
 * after the app advances past their entry round.
 */
export async function readPlayerRecentTicket(
  address: Address,
  currentRoundId: bigint,
  player: Address
): Promise<{ ticket: CrashTicket; round: CrashRound } | null> {
  const found = await scanPlayerTickets(address, currentRoundId, player);
  // Tickets are newest first, so the first match is the most recent.
  return found.find(({ ticket }) => !ticket.settled) ?? found[0] ?? null;
}

/**
 * Returns every ticket the player holds within the lookback window, newest
 * first, with claim/refund/verify flags derived from receipt-backed state.
 */
export async function readPlayerTicketHistory(
  config: MarginCallCrashConfig,
  player: Address
): Promise<PlayerTicketHistoryItem[]> {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const currentRoundId = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "currentRoundId",
    blockNumber: block.number,
  });
  const found = await scanPlayerTickets(
    config.address,
    currentRoundId,
    player,
    block.number
  );
  return found.map(({ ticket, round }) =>
    toPlayerTicketHistoryItem(ticket, round, block.timestamp)
  );
}

/** Loads initialized rounds in the global lookback, newest first. */
export async function readRecentRoundHistory(
  config: MarginCallCrashConfig
): Promise<RoundHistoryItem[]> {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const currentRoundId = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "currentRoundId",
    blockNumber: block.number,
  });
  const roundIds = lookbackRoundIds(
    currentRoundId,
    GLOBAL_HISTORY_LOOKBACK_ROUNDS
  );

  const rounds = await Promise.all(
    roundIds.map((roundId) =>
      baseSepoliaPublicClient
        .readContract({
          address: config.address,
          abi: marginCallCrashAbi,
          functionName: "getRound",
          args: [roundId],
          blockNumber: block.number,
        })
        .then((round) => ({
          ...round,
          status: normalizeRoundStatus(round.status),
        }))
    )
  );

  return rounds
    .filter((round) => isRoundInitialized(round))
    .map((round) => toRoundHistoryItem(round, block.timestamp));
}

/**
 * Full verification record for one round: aggregates, handle, attestation,
 * lifecycle and settlement transaction BaseScan links.
 */
export async function readRoundHistoryDetail(
  config: MarginCallCrashConfig,
  roundId: bigint
): Promise<RoundHistoryDetail | null> {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const round = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "getRound",
    args: [roundId],
    blockNumber: block.number,
  });
  const normalized: CrashRound = {
    ...round,
    status: normalizeRoundStatus(round.status),
  };
  if (!isRoundInitialized(normalized)) return null;

  const [lifecycleUrls, settlementUrls] = await Promise.all([
    readLifecycleUrls(config, roundId, normalized, block.number, {
      fromDeployment: true,
    }),
    readSettlementTransactionUrls(config, roundId, block.number),
  ]);

  return {
    ...toRoundHistoryItem(normalized, block.timestamp),
    ...lifecycleUrls,
    ...settlementUrls,
  };
}

function toRoundHistoryItem(
  round: CrashRound,
  chainTimestamp: bigint
): RoundHistoryItem {
  const phase = deriveRoundPhase(round, chainTimestamp);
  const historyState = deriveHistoryState(phase, round);
  const published = isCrashPointPublished(round);
  return {
    round,
    phase,
    historyState,
    displayCrashPoint: published
      ? formatCrashPointBps(round.crashPointBps)
      : null,
  };
}

/**
 * Map phase → public history label. Ticketless post-lock rounds are "empty"
 * (no attestation owed), not "delayed".
 */
function deriveHistoryState(
  phase: CrashRoundPhase,
  round: CrashRound
): RoundHistoryState {
  switch (phase) {
    case "finalized":
      return "finalized";
    case "expired":
      return "expired";
    case "open":
    case "prelaunch":
    case "uninitialized":
      return "open";
    case "locked":
    case "reveal-requested":
    case "expired-eligible":
      return round.totalMargin === 0n ? "empty" : "delayed";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function toPlayerTicketHistoryItem(
  ticket: CrashTicket,
  round: CrashRound,
  chainTimestamp: bigint
): PlayerTicketHistoryItem {
  const phase = deriveRoundPhase(round, chainTimestamp);
  const outcome = deriveTicketOutcome(ticket, round);
  const published = isCrashPointPublished(round);
  const payout = published
    ? computeTicketPayout(
        ticket.margin,
        ticket.leverageBps,
        round.crashPointBps
      )
    : null;
  const amountKind =
    outcome === "refundable" || outcome === "refunded"
      ? "refund"
      : outcome === "won" || outcome === "settled-win"
        ? "payout"
        : "reserved";
  return {
    ticket,
    round,
    phase,
    outcome,
    displayCrashPoint: published
      ? formatCrashPointBps(round.crashPointBps)
      : null,
    payout,
    amountKind,
    displayAmount:
      amountKind === "refund"
        ? ticket.margin
        : (payout ?? ticket.reservedPayout),
    canClaim: outcome === "won",
    canSettle: outcome === "lost",
    canVerify:
      !ticket.settled && (phase === "locked" || phase === "reveal-requested"),
    canExpire: !ticket.settled && phase === "expired-eligible",
    canRefund: outcome === "refundable",
  };
}

export function isRoundInitialized(round: CrashRound) {
  return round.status !== ROUND_STATUS.uninitialized;
}

/** True only after onchain finalization stores a verified Crash Point. */
export function isCrashPointPublished(round: CrashRound) {
  return round.status === ROUND_STATUS.finalized;
}

/**
 * Formats stored Crash Point basis points for display.
 * Values below 1.00x render as 1.00x without changing settlement math.
 */
export function formatCrashPointBps(crashPointBps: bigint): string {
  const bounded =
    crashPointBps < ONE_X_BPS
      ? ONE_X_BPS
      : crashPointBps > MAX_CRASH_POINT_BPS
        ? MAX_CRASH_POINT_BPS
        : crashPointBps;
  return `${formatHundredths(bounded / 100n)}x`;
}

/** Loads a game round for LP finalize/expire actions. */
export async function readCrashRoundForLp(
  roundId: bigint
): Promise<CrashRound | null> {
  const config = getMarginCallCrashConfig();
  if (!config) return null;
  const round = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "getRound",
    args: [roundId],
  });
  if (round.status === ROUND_STATUS.uninitialized) return null;
  return {
    ...round,
    status: normalizeRoundStatus(round.status),
  };
}

export async function readCurrentCrashRound(config: MarginCallCrashConfig) {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const epochOrigin = await readEpochOrigin(config.address, block.number);
  if (block.timestamp < epochOrigin) {
    const [openAt, lockAt, expiresAt] =
      await baseSepoliaPublicClient.readContract({
        address: config.address,
        abi: marginCallCrashAbi,
        functionName: "roundTimes",
        args: [0n],
        blockNumber: block.number,
      });
    const pendingRound: CrashRound = {
      id: 0n,
      openAt,
      lockAt,
      expiresAt,
      crashRandom: zeroHash,
      crashPointBps: 0n,
      totalMargin: 0n,
      reservedPayout: 0n,
      status: ROUND_STATUS.uninitialized,
    };

    return {
      blockNumber: block.number,
      chainTimestamp: block.timestamp,
      currentRoundId: 0n,
      round: pendingRound,
      finalizedAtSeconds: null,
      ...emptyLifecycleUrls(config.address),
    };
  }

  const currentRoundId = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "currentRoundId",
    blockNumber: block.number,
  });
  const round = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "getRound",
    args: [currentRoundId],
    blockNumber: block.number,
  });
  const normalizedRound: CrashRound = {
    ...round,
    status: normalizeRoundStatus(round.status),
  };
  // An uninitialized round's stored struct is zeroed; fill the immutable grid
  // times so phase and timeline math stay meaningful before an opener arrives.
  if (normalizedRound.status === ROUND_STATUS.uninitialized) {
    const [openAt, lockAt, expiresAt] =
      await baseSepoliaPublicClient.readContract({
        address: config.address,
        abi: marginCallCrashAbi,
        functionName: "roundTimes",
        args: [currentRoundId],
        blockNumber: block.number,
      });
    normalizedRound.id = currentRoundId;
    normalizedRound.openAt = openAt;
    normalizedRound.lockAt = lockAt;
    normalizedRound.expiresAt = expiresAt;
  }
  const lifecycleUrls = await readLifecycleUrls(
    config,
    currentRoundId,
    normalizedRound,
    block.number
  );
  const finalizedAtSeconds =
    normalizedRound.status === ROUND_STATUS.finalized
      ? await readFinalizedAtSeconds(
          config,
          currentRoundId,
          normalizedRound,
          block.number
        )
      : null;

  return {
    blockNumber: block.number,
    chainTimestamp: block.timestamp,
    currentRoundId,
    round: normalizedRound,
    finalizedAtSeconds,
    ...lifecycleUrls,
  };
}

/**
 * Public TicketEntered rows for one round, plus per-tier aggregates for the
 * theater tape and tier-close payout pops.
 */
export async function readRoundTicketTape(
  config: MarginCallCrashConfig,
  roundId: bigint
): Promise<RoundTicketTape> {
  const cacheKey = lifecycleCacheKey(config.address, roundId);
  const cached = ticketTapeCache.get(cacheKey);
  const latestBlock = await baseSepoliaPublicClient.getBlockNumber();

  let entries = cached?.entries ?? [];
  const fromBlock =
    cached !== undefined
      ? cached.lastScannedBlock + 1n
      : config.deploymentBlock;
  if (fromBlock <= latestBlock) {
    const logs = await baseSepoliaPublicClient.getLogs({
      address: config.address,
      event: ticketEnteredEvent,
      args: { roundId },
      fromBlock,
      toBlock: latestBlock,
      strict: true,
    });
    entries = [
      ...entries,
      ...logs.map((log) => ({
        ticketId: log.args.ticketId,
        player: log.args.player,
        margin: log.args.margin,
        leverageBps: log.args.leverageBps,
        reservedPayout: log.args.reservedPayout,
        transactionHash: log.transactionHash,
      })),
    ];
    ticketTapeCache.set(cacheKey, { lastScannedBlock: latestBlock, entries });
  }

  return {
    roundId,
    entries,
    tiers: aggregateTierExposure(entries),
  };
}

/**
 * Newest finalized round within the global lookback, for Open-phase
 * previous-round replay. Returns null when none exist.
 */
export async function readLatestFinalizedReplayRound(
  config: MarginCallCrashConfig
): Promise<FinalizedReplayRound | null> {
  const blockNumber = await baseSepoliaPublicClient.getBlockNumber();
  const currentRoundId = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "currentRoundId",
    blockNumber,
  });
  const roundIds = lookbackRoundIds(
    currentRoundId,
    GLOBAL_HISTORY_LOOKBACK_ROUNDS
  );

  // Concurrent reads collapse into a multicall batch; ids are newest-first,
  // so the first finalized hit is the latest one.
  const rounds = await Promise.all(
    roundIds.map((roundId) =>
      baseSepoliaPublicClient.readContract({
        address: config.address,
        abi: marginCallCrashAbi,
        functionName: "getRound",
        args: [roundId],
        blockNumber,
      })
    )
  );

  for (const round of rounds) {
    const normalized: CrashRound = {
      ...round,
      status: normalizeRoundStatus(round.status),
    };
    if (normalized.status !== ROUND_STATUS.finalized) continue;

    return {
      round: normalized,
      displayCrashPoint: formatCrashPointBps(normalized.crashPointBps),
    };
  }

  return null;
}

/**
 * Resolves the Unix timestamp of RoundFinalized for a finalized round.
 * Cached forever — finalized rounds are immutable. Prefers the block number
 * already captured by the lifecycle URL lookup to avoid a second getLogs.
 */
export async function readFinalizedAtSeconds(
  config: MarginCallCrashConfig,
  roundId: bigint,
  round: CrashRound,
  toBlock: bigint
): Promise<bigint | null> {
  if (round.status !== ROUND_STATUS.finalized) return null;

  const cacheKey = lifecycleCacheKey(config.address, roundId);
  const cached = finalizeTimestampCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let blockNumber = finalizeBlockNumberCache.get(cacheKey);
  if (blockNumber === undefined) {
    // Try the recent lookback window first, then the full deployment range.
    const lookbackBlock = getEventFromBlock(config.deploymentBlock, toBlock);
    const fromBlocks =
      lookbackBlock > config.deploymentBlock
        ? [lookbackBlock, config.deploymentBlock]
        : [lookbackBlock];
    for (const fromBlock of fromBlocks) {
      const result = await readExactRoundEvent({
        config,
        roundId,
        event: roundFinalizedEvent,
        fromBlock,
        toBlock,
        required: false,
      });
      if (result.blockNumber !== null) {
        blockNumber = result.blockNumber;
        break;
      }
    }
    if (blockNumber === undefined) return null;
    finalizeBlockNumberCache.set(cacheKey, blockNumber);
  }

  const block = await baseSepoliaPublicClient.getBlock({ blockNumber });
  finalizeTimestampCache.set(cacheKey, block.timestamp);
  return block.timestamp;
}

async function readEpochOrigin(
  address: Address,
  blockNumber: bigint
): Promise<bigint> {
  const cached = epochOriginCache.get(address);
  if (cached !== undefined) return cached;

  const epochOrigin = await baseSepoliaPublicClient.readContract({
    address,
    abi: marginCallCrashAbi,
    functionName: "epochOrigin",
    blockNumber,
  });
  epochOriginCache.set(address, epochOrigin);
  return epochOrigin;
}

async function readLifecycleUrls(
  config: MarginCallCrashConfig,
  roundId: bigint,
  round: CrashRound,
  toBlock: bigint,
  options: { fromDeployment?: boolean } = {}
): Promise<CrashRoundLifecycleUrls> {
  const urls = emptyLifecycleUrls(config.address);
  if (!isRoundInitialized(round)) return urls;

  const cacheKey = lifecycleCacheKey(config.address, roundId);
  const cached = lifecycleTransactionCache.get(cacheKey) ?? {};
  const fromBlock = options.fromDeployment
    ? config.deploymentBlock
    : getEventFromBlock(config.deploymentBlock, toBlock);
  const revealPossible =
    round.status === ROUND_STATUS.revealRequested ||
    round.status === ROUND_STATUS.finalized ||
    round.status === ROUND_STATUS.expired;
  const lookups: Array<{
    key: LifecycleEventKey;
    event: RoundLifecycleEvent;
    lookup: boolean;
    required: boolean;
  }> = [
    { key: "opening", event: roundOpenedEvent, lookup: true, required: true },
    {
      key: "reveal",
      event: revealRequestedEvent,
      lookup: revealPossible,
      // An expired round may have ended without any reveal request.
      required: round.status !== ROUND_STATUS.expired,
    },
    {
      key: "finalize",
      event: roundFinalizedEvent,
      lookup: round.status === ROUND_STATUS.finalized,
      required: true,
    },
    {
      key: "expire",
      event: roundExpiredEvent,
      lookup: round.status === ROUND_STATUS.expired,
      required: true,
    },
  ];

  const hashes: Partial<Record<LifecycleEventKey, Hash | null>> = { ...cached };
  await Promise.all(
    lookups.map(async ({ key, event, lookup, required }) => {
      if (!lookup) return;
      if (cached[key] !== undefined) {
        hashes[key] = cached[key];
        return;
      }
      const result = await readExactRoundEvent({
        config,
        roundId,
        event,
        fromBlock,
        toBlock,
        required,
      });
      hashes[key] = result.hash;
      if (key === "finalize" && result.blockNumber !== null) {
        finalizeBlockNumberCache.set(cacheKey, result.blockNumber);
      }
    })
  );
  lifecycleTransactionCache.set(cacheKey, hashes);

  return {
    ...urls,
    openingTransactionUrl: toTransactionUrl(hashes.opening),
    revealTransactionUrl: toTransactionUrl(hashes.reveal),
    finalizeTransactionUrl: toTransactionUrl(hashes.finalize),
    expireTransactionUrl: toTransactionUrl(hashes.expire),
  };
}

async function readSettlementTransactionUrls(
  config: MarginCallCrashConfig,
  roundId: bigint,
  toBlock: bigint
): Promise<{
  ticketEnteredTransactionUrls: string[];
  ticketClaimedTransactionUrls: string[];
  ticketRefundedTransactionUrls: string[];
}> {
  const fromBlock = config.deploymentBlock;
  const [entered, claimed, refunded] = await Promise.all([
    baseSepoliaPublicClient.getLogs({
      address: config.address,
      event: ticketEnteredEvent,
      args: { roundId },
      fromBlock,
      toBlock,
      strict: true,
    }),
    baseSepoliaPublicClient.getLogs({
      address: config.address,
      event: ticketClaimedEvent,
      args: { roundId },
      fromBlock,
      toBlock,
      strict: true,
    }),
    baseSepoliaPublicClient.getLogs({
      address: config.address,
      event: ticketRefundedEvent,
      args: { roundId },
      fromBlock,
      toBlock,
      strict: true,
    }),
  ]);

  return {
    ticketEnteredTransactionUrls: uniqueTransactionUrls(entered),
    ticketClaimedTransactionUrls: uniqueTransactionUrls(claimed),
    ticketRefundedTransactionUrls: uniqueTransactionUrls(refunded),
  };
}

function uniqueTransactionUrls(
  logs: ReadonlyArray<{ transactionHash: Hash | null }>
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log.transactionHash || seen.has(log.transactionHash)) continue;
    seen.add(log.transactionHash);
    urls.push(getBaseSepoliaTransactionUrl(log.transactionHash));
  }
  return urls;
}

function toTransactionUrl(hash: Hash | null | undefined): string | null {
  return hash ? getBaseSepoliaTransactionUrl(hash) : null;
}

async function readExactRoundEvent({
  config,
  roundId,
  event,
  fromBlock,
  toBlock,
  required,
}: {
  config: MarginCallCrashConfig;
  roundId: bigint;
  event: RoundLifecycleEvent;
  fromBlock: bigint;
  toBlock: bigint;
  required: boolean;
}): Promise<{ hash: Hash | null; blockNumber: bigint | null }> {
  const logs = await baseSepoliaPublicClient.getLogs({
    address: config.address,
    event,
    args: { roundId },
    fromBlock,
    toBlock,
    strict: true,
  });

  if (!logs || logs.length === 0) {
    if (required) {
      throw new Error(`Expected one ${event.name} event for round ${roundId}`);
    }
    return { hash: null, blockNumber: null };
  }
  if (logs.length !== 1 || !logs[0].transactionHash) {
    throw new Error(
      `Expected one ${event.name} event for round ${roundId}, found ${logs.length}`
    );
  }
  return {
    hash: logs[0].transactionHash,
    blockNumber: logs[0].blockNumber ?? null,
  };
}

function lifecycleCacheKey(address: Address, roundId: bigint) {
  return `${address.toLowerCase()}:${roundId.toString()}`;
}

function getEventFromBlock(deploymentBlock: bigint, toBlock: bigint): bigint {
  const recentFromBlock =
    toBlock > ROUND_EVENT_LOOKBACK_BLOCKS
      ? toBlock - ROUND_EVENT_LOOKBACK_BLOCKS
      : 0n;
  return deploymentBlock > recentFromBlock ? deploymentBlock : recentFromBlock;
}

function emptyLifecycleUrls(address: Address): CrashRoundLifecycleUrls {
  return {
    openingTransactionUrl: null,
    revealTransactionUrl: null,
    finalizeTransactionUrl: null,
    expireTransactionUrl: null,
    gameContractUrl: getBaseSepoliaContractCodeUrl(address),
    incoContractUrl: getBaseSepoliaContractCodeUrl(
      BASE_SEPOLIA_INCO_LIGHTNING_ADDRESS
    ),
  };
}

function normalizeRoundStatus(status: number): CrashRoundStatus {
  if (
    status === ROUND_STATUS.uninitialized ||
    status === ROUND_STATUS.open ||
    status === ROUND_STATUS.revealRequested ||
    status === ROUND_STATUS.finalized ||
    status === ROUND_STATUS.expired
  ) {
    return status;
  }
  throw new Error(`Unsupported round status: ${status}`);
}

function parseDeploymentBlock(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}
