/**
 * Shared Base Sepolia Crash game read wiring for Convex node actions.
 * Pure helpers — not a Convex function module.
 */

import { parseAddress } from "@margin-call/shared/address";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import deployments from "../../contracts/deployments/base_sepolia.json";

export const DEFAULT_CRASH_GAME_ADDRESS = getAddress(
  deployments.marginCallCrash
);

/** Read-only ABI shared by desk-phone verification and other Convex readers. */
export const CRASH_GAME_READ_ABI = parseAbi([
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function getTicket(uint256 ticketId) view returns ((uint256 id, address player, uint256 roundId, uint256 margin, uint256 leverageBps, uint256 reservedPayout, bool settled, bool claimed))",
]);

export function resolveBaseSepoliaRpcUrl(): string | null {
  return (
    process.env.BASE_SEPOLIA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim() ||
    null
  );
}

export function resolveCrashGameAddress(): Address {
  const override = parseAddress(process.env.MARGIN_CALL_CRASH_ADDRESS);
  return override ?? DEFAULT_CRASH_GAME_ADDRESS;
}

export function createBaseSepoliaPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

type CrashPublicClient = ReturnType<typeof createBaseSepoliaPublicClient>;

export async function readCrashTicketAndRound(
  client: CrashPublicClient,
  game: Address,
  ticketId: bigint,
  roundId: bigint
) {
  const [ticket, round] = await Promise.all([
    client.readContract({
      address: game,
      abi: CRASH_GAME_READ_ABI,
      functionName: "getTicket",
      args: [ticketId],
    }),
    client.readContract({
      address: game,
      abi: CRASH_GAME_READ_ABI,
      functionName: "getRound",
      args: [roundId],
    }),
  ]);
  return { ticket, round };
}
