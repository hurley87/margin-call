/**
 * Pool indexer scan + log-apply helpers.
 *
 * Kept outside the `"use node"` action file so Vitest can unit-test cursor
 * advancement and error boundaries without Convex action bootstrap.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeEventLog,
  type AbiEvent,
  type Log,
  type PublicClient,
} from "viem";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { packCustodyAbi, ripEngineAbi } from "./chain/abis";
import { stockSymbolForAddress } from "./stockTokens";

export const MAX_BLOCK_SPAN = 2_000n;

/** Max resting packs refreshed per cron tick (batched on-chain reads). */
export const RESTING_REFRESH_LIMIT = 50;

type BasketEntry = {
  asset: string;
  amount: string;
  symbol: string | null;
};

/** Normalize a raw on-chain basket (asset/amount tuples) into `BasketEntry[]`. */
function normalizeBasket(
  raw: readonly { asset: `0x${string}`; amount: bigint }[]
): BasketEntry[] {
  return raw.map((entry) => ({
    asset: entry.asset.toLowerCase(),
    amount: entry.amount.toString(),
    symbol: stockSymbolForAddress(entry.asset),
  }));
}

/** Mutation args for a resting-pack upsert (shared by event + cron paths). */
function restingUpsertArgs(args: {
  tokenId: bigint;
  maker: string;
  basket: BasketEntry[];
  navUsdWad: string | null;
  eligible: boolean;
  now: number;
}) {
  return {
    tokenId: Number(args.tokenId),
    maker: args.maker.toLowerCase(),
    basket: args.basket,
    navUsdWad: args.navUsdWad,
    status: "resting" as const,
    eligible: args.eligible,
    updatedAt: args.now,
  };
}

/**
 * True when viem reports a contract revert (as opposed to RPC/transport failure).
 * Contract reverts for `navOfPack` mean "no usable NAV" (empty basket / quote fail).
 */
export function isContractCallRevert(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return (
    err.walk((e) => e instanceof ContractFunctionRevertedError) instanceof
    ContractFunctionRevertedError
  );
}

/** Decode a log against `abi`; return null when topics/data don't match. */
export function tryDecodeEventLog(
  abi: typeof ripEngineAbi | typeof packCustodyAbi,
  log: Log
) {
  try {
    return decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
    });
  } catch {
    return null;
  }
}

export async function readBasket(
  client: PublicClient,
  packCustody: `0x${string}`,
  tokenId: bigint
): Promise<BasketEntry[]> {
  const basket = await client.readContract({
    address: packCustody,
    abi: packCustodyAbi,
    functionName: "basketOf",
    args: [tokenId],
  });
  return normalizeBasket(basket);
}

/**
 * Read pack NAV. Contract revert → null (genuinely unusable NAV).
 * RPC / transport / unexpected errors propagate so the scan can retry.
 */
export async function readNavOfPack(
  client: PublicClient,
  ripEngine: `0x${string}`,
  tokenId: bigint
): Promise<string | null> {
  try {
    const nav = await client.readContract({
      address: ripEngine,
      abi: ripEngineAbi,
      functionName: "navOfPack",
      args: [tokenId],
    });
    return nav.toString();
  } catch (err) {
    if (isContractCallRevert(err)) return null;
    throw err;
  }
}

export type RestingPackMeta = {
  tokenId: bigint;
  maker: `0x${string}`;
  basket: BasketEntry[];
  navUsdWad: string | null;
};

/**
 * Batch-read creator + basket (+ NAV when not already known) for resting packs
 * via Multicall3. The identity and NAV reads are independent, so they fire
 * together in a single round-trip (both aggregate3 calls also batch on the wire).
 */
export async function readRestingPackMetas(
  client: PublicClient,
  packCustody: `0x${string}`,
  ripEngine: `0x${string}`,
  tokenIds: readonly bigint[],
  navByTokenId: ReadonlyMap<number, string>
): Promise<RestingPackMeta[]> {
  if (tokenIds.length === 0) return [];

  const identityContracts = tokenIds.flatMap((tokenId) => [
    {
      address: packCustody,
      abi: packCustodyAbi,
      functionName: "creatorOf" as const,
      args: [tokenId] as const,
    },
    {
      address: packCustody,
      abi: packCustodyAbi,
      functionName: "basketOf" as const,
      args: [tokenId] as const,
    },
  ]);

  // Seed NAVs from the eligible snapshot; only the misses need an on-chain read.
  const navByIndex = tokenIds.map(
    (tokenId) => navByTokenId.get(Number(tokenId)) ?? null
  );
  const needsNavIndexes = navByIndex.flatMap((nav, i) =>
    nav === null ? [i] : []
  );

  const [identityResults, navResults] = await Promise.all([
    client.multicall({ contracts: identityContracts, allowFailure: false }),
    needsNavIndexes.length > 0
      ? client.multicall({
          contracts: needsNavIndexes.map((i) => ({
            address: ripEngine,
            abi: ripEngineAbi,
            functionName: "navOfPack" as const,
            args: [tokenIds[i]!] as const,
          })),
          allowFailure: true,
        })
      : Promise.resolve<never[]>([]),
  ]);

  needsNavIndexes.forEach((packIndex, j) => {
    const result = navResults[j]!;
    navByIndex[packIndex] =
      result.status === "success" ? result.result.toString() : null;
  });

  return tokenIds.map((tokenId, i) => ({
    tokenId,
    maker: identityResults[i * 2] as `0x${string}`,
    basket: normalizeBasket(
      identityResults[i * 2 + 1] as readonly {
        asset: `0x${string}`;
        amount: bigint;
      }[]
    ),
    navUsdWad: navByIndex[i],
  }));
}

export async function upsertRestingPack(
  ctx: ActionCtx,
  client: PublicClient,
  packCustody: `0x${string}`,
  ripEngine: `0x${string}`,
  tokenId: bigint,
  maker: string,
  eligible: boolean,
  now: number,
  knownNavWad?: string
): Promise<void> {
  const basket = await readBasket(client, packCustody, tokenId);
  const navUsdWad =
    knownNavWad !== undefined
      ? knownNavWad
      : await readNavOfPack(client, ripEngine, tokenId);
  await ctx.runMutation(
    internal.poolIndexer.upsertPack,
    restingUpsertArgs({ tokenId, maker, basket, navUsdWad, eligible, now })
  );
}

/**
 * Refresh up to `limit` resting packs with batched on-chain reads, then
 * parallel Convex upserts.
 */
export async function refreshRestingPacks(
  ctx: ActionCtx,
  client: PublicClient,
  packCustody: `0x${string}`,
  ripEngine: `0x${string}`,
  restingIds: readonly bigint[],
  eligibleSet: ReadonlySet<number>,
  now: number,
  navByTokenId: ReadonlyMap<number, string>,
  limit = RESTING_REFRESH_LIMIT
): Promise<void> {
  const tokenIds = restingIds.slice(0, limit);
  const metas = await readRestingPackMetas(
    client,
    packCustody,
    ripEngine,
    tokenIds,
    navByTokenId
  );
  await Promise.all(
    metas.map((meta) =>
      ctx.runMutation(
        internal.poolIndexer.upsertPack,
        restingUpsertArgs({
          tokenId: meta.tokenId,
          maker: meta.maker,
          basket: meta.basket,
          navUsdWad: meta.navUsdWad,
          eligible: eligibleSet.has(Number(meta.tokenId)),
          now,
        })
      )
    )
  );
}

/**
 * Read a pack's basket and upsert it in a terminal (non-resting) state.
 * Shared by terminal/non-resting handlers, which differ
 * only in `status`, `navUsdWad`, and where the maker comes from.
 */
async function upsertTerminalPack(
  ctx: ActionCtx,
  client: PublicClient,
  packCustody: `0x${string}`,
  tokenId: bigint,
  maker: string,
  status: "exited" | "ripped" | "unlisted",
  navUsdWad: string | null,
  now: number
): Promise<void> {
  const basket = await readBasket(client, packCustody, tokenId);
  await ctx.runMutation(internal.poolIndexer.upsertPack, {
    tokenId: Number(tokenId),
    maker: maker.toLowerCase(),
    basket,
    navUsdWad,
    status,
    eligible: false,
    updatedAt: now,
  });
}

/**
 * Scan a contract's logs from its persisted cursor (or `fallbackBlock`) up to
 * `latest`, in `MAX_BLOCK_SPAN` chunks, applying each log and advancing the
 * cursor only after a chunk fully succeeds.
 */
export async function scanLogs(
  ctx: ActionCtx,
  client: PublicClient,
  opts: {
    key: string;
    address: `0x${string}`;
    events: AbiEvent[];
    fallbackBlock: bigint;
    latest: bigint;
    apply: (log: Log) => Promise<void>;
  }
): Promise<void> {
  const cursor =
    (await ctx.runQuery(internal.poolIndexer.getCursor, { key: opts.key })) ??
    Number(opts.fallbackBlock);
  let from = BigInt(cursor);
  while (from <= opts.latest) {
    const to =
      from + MAX_BLOCK_SPAN > opts.latest ? opts.latest : from + MAX_BLOCK_SPAN;
    const logs = await client.getLogs({
      address: opts.address,
      events: opts.events,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      await opts.apply(log);
    }
    // Advance only after every log in this chunk was applied successfully.
    // A thrown apply/RPC error leaves the cursor unmoved so the next sync retries.
    await ctx.runMutation(internal.poolIndexer.setCursor, {
      key: opts.key,
      blockNumber: Number(to),
    });
    from = to + 1n;
  }
}

export async function applyRipEngineLog(
  ctx: ActionCtx,
  client: PublicClient,
  addresses: {
    packCustody: `0x${string}`;
    ripEngine: `0x${string}`;
  },
  log: Log,
  now: number
): Promise<void> {
  const decoded = tryDecodeEventLog(ripEngineAbi, log);
  if (!decoded) return;

  if (decoded.eventName === "PackEntered") {
    await upsertRestingPack(
      ctx,
      client,
      addresses.packCustody,
      addresses.ripEngine,
      decoded.args.tokenId,
      decoded.args.maker,
      true,
      now
    );
    return;
  }
  if (decoded.eventName === "PackExited") {
    const navUsdWad = await readNavOfPack(
      client,
      addresses.ripEngine,
      decoded.args.tokenId
    );
    await upsertTerminalPack(
      ctx,
      client,
      addresses.packCustody,
      decoded.args.tokenId,
      decoded.args.maker,
      "exited",
      navUsdWad,
      now
    );
    return;
  }
  if (decoded.eventName === "PackRipped") {
    await upsertTerminalPack(
      ctx,
      client,
      addresses.packCustody,
      decoded.args.tokenId,
      decoded.args.maker,
      "ripped",
      decoded.args.nav.toString(),
      now
    );
  }
}

export async function applyPackCustodyLog(
  ctx: ActionCtx,
  client: PublicClient,
  packCustody: `0x${string}`,
  log: Log,
  now: number
): Promise<void> {
  const decoded = tryDecodeEventLog(packCustodyAbi, log);
  if (!decoded) return;

  if (decoded.eventName === "PackRedeemed") {
    const basket = decoded.args.assets.map((asset, index) => ({
      asset: asset.toLowerCase(),
      amount: decoded.args.amounts[index]!.toString(),
      symbol: stockSymbolForAddress(asset),
    }));
    await ctx.runMutation(internal.poolIndexer.upsertPack, {
      tokenId: Number(decoded.args.tokenId),
      maker: decoded.args.creator.toLowerCase(),
      basket,
      navUsdWad: null,
      status: "unlisted",
      eligible: false,
      updatedAt: now,
    });
    return;
  }

  if (decoded.eventName !== "PackUnlisted") return;

  const tokenId = decoded.args.tokenId;
  const maker = await client.readContract({
    address: packCustody,
    abi: packCustodyAbi,
    functionName: "creatorOf",
    args: [tokenId],
  });
  await upsertTerminalPack(
    ctx,
    client,
    packCustody,
    tokenId,
    maker,
    "unlisted",
    null,
    now
  );
}

/** Backward-compatible narrow helper retained for focused tests/importers. */
export const applyPackUnlisted = applyPackCustodyLog;
