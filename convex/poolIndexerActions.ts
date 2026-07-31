"use node";

import {
  PACKCUSTODY_DEPLOY_BLOCK_BIGINT as PACKCUSTODY_DEPLOY_BLOCK,
  RIPENGINE_DEPLOY_BLOCK_BIGINT as RIPENGINE_DEPLOY_BLOCK,
} from "@margin-call/shared";
import { v } from "convex/values";
import { parseAbiItem } from "viem";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { assetRegistryAbi, ripEngineAbi } from "./lib/chain/abis";
import { requireIndexerAddresses } from "./lib/chain/addresses";
import { createChainPublicClient } from "./lib/chain/clients";
import {
  applyPackCustodyLog,
  applyRipEngineLog,
  refreshRestingPacks,
  scanLogs,
} from "./lib/poolIndexerHandlers";
import {
  buildNavDistribution,
  harmonicMeanWad,
  unitPriceFromHm,
} from "./lib/poolStats";

const packUnlistedEvent = parseAbiItem(
  "event PackUnlisted(uint256 indexed tokenId)"
);
const packRedeemedEvent = parseAbiItem(
  "event PackRedeemed(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts)"
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
      events: [packUnlistedEvent, packRedeemedEvent],
      fallbackBlock: PACKCUSTODY_DEPLOY_BLOCK,
      latest,
      apply: (log) =>
        applyPackCustodyLog(ctx, client, addresses.packCustody, log, now),
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
    // packs every cron tick. creatorOf + basketOf are batched via Multicall3.
    const navByTokenId = new Map<number, string>();
    for (let i = 0; i < eligibleCount; i++) {
      navByTokenId.set(Number(tokenIds[i]), navs[i]!.toString());
    }
    const eligibleSet = new Set(navByTokenId.keys());

    await refreshRestingPacks(
      ctx,
      client,
      addresses.packCustody,
      addresses.ripEngine,
      restingIds,
      eligibleSet,
      now,
      navByTokenId
    );

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
