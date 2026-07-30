"use node";

import { v } from "convex/values";
import { decodeEventLog, parseAbiItem, type AbiEvent, type Log } from "viem";

import { internal } from "./_generated/api";
import { type ActionCtx, internalAction } from "./_generated/server";
import {
  assetRegistryAbi,
  packCustodyAbi,
  ripEngineAbi,
} from "./lib/chain/abis";
import { requireIndexerAddresses } from "./lib/chain/addresses";
import { createChainPublicClient } from "./lib/chain/clients";
import {
  buildNavDistribution,
  harmonicMeanWad,
  unitPriceFromHm,
} from "./lib/poolStats";
import { stockSymbolForAddress } from "./lib/stockTokens";

const PACKCUSTODY_DEPLOY_BLOCK = 95_307_505n;
const RIPENGINE_DEPLOY_BLOCK = 95_311_248n;
const MAX_BLOCK_SPAN = 2_000n;

const packUnlistedEvent = parseAbiItem(
  "event PackUnlisted(uint256 indexed tokenId)"
);
const packEnteredEvent = parseAbiItem(
  "event PackEntered(uint256 indexed tokenId, address indexed maker)"
);
const packExitedEvent = parseAbiItem(
  "event PackExited(uint256 indexed tokenId, address indexed maker)"
);
const packRippedEvent = parseAbiItem(
  "event PackRipped(uint256 indexed tokenId, address indexed taker, address indexed maker, uint256 nav, uint256 unitPrice, uint256 protocolCut, uint256 crownCut, uint256 toMakers)"
);

type BasketEntry = {
  asset: string;
  amount: string;
  symbol: string | null;
};

type PublicClient = ReturnType<typeof createChainPublicClient>;

async function readBasket(
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
  return basket.map((entry) => ({
    asset: entry.asset.toLowerCase(),
    amount: entry.amount.toString(),
    symbol: stockSymbolForAddress(entry.asset),
  }));
}

async function upsertRestingPack(
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
  let navUsdWad: string | null = knownNavWad ?? null;
  // Only hit the chain when the caller didn't already have this pack's NAV
  // (e.g. from eligibleSnapshot).
  if (navUsdWad === null) {
    try {
      const nav = await client.readContract({
        address: ripEngine,
        abi: ripEngineAbi,
        functionName: "navOfPack",
        args: [tokenId],
      });
      navUsdWad = nav.toString();
    } catch {
      navUsdWad = null;
    }
  }
  await ctx.runMutation(internal.poolIndexer.upsertPack, {
    tokenId: Number(tokenId),
    maker: maker.toLowerCase(),
    basket,
    navUsdWad,
    status: "resting",
    eligible,
    updatedAt: now,
  });
}

/**
 * Scan a contract's logs from its persisted cursor (or `fallbackBlock`) up to
 * `latest`, in `MAX_BLOCK_SPAN` chunks, applying each log and advancing the
 * cursor per chunk.
 */
async function scanLogs(
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
    await ctx.runMutation(internal.poolIndexer.setCursor, {
      key: opts.key,
      blockNumber: Number(to),
    });
    from = to + 1n;
  }
}

/**
 * Sync Pack membership + Pool Statistics from live RipEngine / PackCustody.
 * Empty eligible set writes a zero snapshot (valid until House/Maker seed).
 */
export const syncPoolFromChain = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    message: v.string(),
    eligibleCount: v.optional(v.number()),
  }),
  handler: async (
    ctx
  ): Promise<{ ok: boolean; message: string; eligibleCount?: number }> => {
    let addresses;
    try {
      addresses = requireIndexerAddresses();
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : "Addresses not configured",
      };
    }

    const client = createChainPublicClient();
    const latest = await client.getBlockNumber();
    const now = Date.now();

    // RipEngine membership / settlement logs
    await scanLogs(ctx, client, {
      key: "ripEngine",
      address: addresses.ripEngine,
      events: [packEnteredEvent, packExitedEvent, packRippedEvent],
      fallbackBlock: RIPENGINE_DEPLOY_BLOCK,
      latest,
      apply: (log) => applyRipEngineLog(ctx, client, addresses, log, now),
    });

    // PackCustody unlist logs (delist-and-redeem / transfer-out)
    await scanLogs(ctx, client, {
      key: "packCustody",
      address: addresses.packCustody,
      events: [packUnlistedEvent],
      fallbackBlock: PACKCUSTODY_DEPLOY_BLOCK,
      latest,
      apply: (log) =>
        applyPackUnlisted(ctx, client, addresses.packCustody, log, now),
    });

    // Live eligible snapshot + quote
    const [tokenIds, navs, eligibleCountRaw] = await client.readContract({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "eligibleSnapshot",
    });
    const eligibleCount = Number(eligibleCountRaw);
    const restingIds = await client.readContract({
      address: addresses.ripEngine,
      abi: ripEngineAbi,
      functionName: "restingPackIds",
    });
    const restingCount = restingIds.length;

    const navWadStrings = navs.slice(0, eligibleCount).map((n) => n.toString());
    const distribution = buildNavDistribution(navWadStrings);

    let harmonicMeanNavWad: string | null = null;
    let ripUnitPriceWad: string | null = null;

    if (eligibleCount > 1) {
      try {
        const quote = await client.readContract({
          address: addresses.ripEngine,
          abi: ripEngineAbi,
          functionName: "quoteRip",
          args: [1n],
        });
        harmonicMeanNavWad = quote[1].toString();
        ripUnitPriceWad = quote[2].toString();
      } catch {
        // Fall through to offline quote.
      }
    }

    if (harmonicMeanNavWad === null && eligibleCount >= 1) {
      const surcharge = await client.readContract({
        address: addresses.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "surcharge",
      });
      harmonicMeanNavWad = harmonicMeanWad(navWadStrings);
      ripUnitPriceWad = unitPriceFromHm(harmonicMeanNavWad, surcharge);
    }

    // Reuse the NAVs eligibleSnapshot already returned (indexed alongside
    // tokenIds) so the per-pack refresh doesn't re-read navOfPack for eligible
    // packs every cron tick.
    const navByTokenId = new Map<number, string>();
    for (let i = 0; i < eligibleCount; i++) {
      navByTokenId.set(Number(tokenIds[i]), navs[i]!.toString());
    }
    const eligibleSet = new Set(navByTokenId.keys());

    const refreshLimit = Math.min(restingIds.length, 50);
    for (let i = 0; i < refreshLimit; i++) {
      const tokenId = restingIds[i]!;
      const maker = await client.readContract({
        address: addresses.packCustody,
        abi: packCustodyAbi,
        functionName: "creatorOf",
        args: [tokenId],
      });
      await upsertRestingPack(
        ctx,
        client,
        addresses.packCustody,
        addresses.ripEngine,
        tokenId,
        maker,
        eligibleSet.has(Number(tokenId)),
        now,
        navByTokenId.get(Number(tokenId))
      );
    }

    await ctx.runMutation(internal.poolIndexer.writeSnapshot, {
      eligibleCount,
      restingCount,
      harmonicMeanNavWad,
      ripUnitPriceWad,
      navDistribution: distribution,
      blockNumber: Number(latest),
      updatedAt: now,
    });

    return {
      ok: true,
      message: `Synced through block ${latest}`,
      eligibleCount,
    };
  },
});

async function applyRipEngineLog(
  ctx: ActionCtx,
  client: PublicClient,
  addresses: {
    packCustody: `0x${string}`;
    ripEngine: `0x${string}`;
  },
  log: Log,
  now: number
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: ripEngineAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName === "PackEntered") {
      await upsertRestingPack(
        ctx,
        client,
        addresses.packCustody,
        addresses.ripEngine,
        decoded.args.tokenId as bigint,
        decoded.args.maker as string,
        true,
        now
      );
      return;
    }
    if (decoded.eventName === "PackExited") {
      const tokenId = decoded.args.tokenId as bigint;
      const basket = await readBasket(client, addresses.packCustody, tokenId);
      await ctx.runMutation(internal.poolIndexer.upsertPack, {
        tokenId: Number(tokenId),
        maker: (decoded.args.maker as string).toLowerCase(),
        basket,
        navUsdWad: null,
        status: "unlisted",
        eligible: false,
        updatedAt: now,
      });
      return;
    }
    if (decoded.eventName === "PackRipped") {
      const tokenId = decoded.args.tokenId as bigint;
      const basket = await readBasket(client, addresses.packCustody, tokenId);
      await ctx.runMutation(internal.poolIndexer.upsertPack, {
        tokenId: Number(tokenId),
        maker: (decoded.args.maker as string).toLowerCase(),
        basket,
        navUsdWad: (decoded.args.nav as bigint).toString(),
        status: "ripped",
        eligible: false,
        updatedAt: now,
      });
    }
  } catch {
    // Skip undecodable logs.
  }
}

async function applyPackUnlisted(
  ctx: ActionCtx,
  client: PublicClient,
  packCustody: `0x${string}`,
  log: Log,
  now: number
): Promise<void> {
  try {
    const decoded = decodeEventLog({
      abi: packCustodyAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "PackUnlisted") return;
    const tokenId = decoded.args.tokenId as bigint;
    const basket = await readBasket(client, packCustody, tokenId);
    const maker = await client.readContract({
      address: packCustody,
      abi: packCustodyAbi,
      functionName: "creatorOf",
      args: [tokenId],
    });
    await ctx.runMutation(internal.poolIndexer.upsertPack, {
      tokenId: Number(tokenId),
      maker: maker.toLowerCase(),
      basket,
      navUsdWad: null,
      status: "unlisted",
      eligible: false,
      updatedAt: now,
    });
  } catch {
    // Skip undecodable logs.
  }
}
