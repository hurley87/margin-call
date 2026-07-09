"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { verifyTxSucceeded, verifyDealCreatedInReceipt } from "./deskByo";
import { USDC_DECIMALS } from "./escrowConstants";

export type VerifiedDealCreated = {
  prompt: string;
  potUsdc: number;
  entryCostUsdc: number;
};

/** Parse and validate DealCreated from an on-chain createDeal tx receipt. */
export const verifyDealCreatedFromTx = internalAction({
  args: {
    txHash: v.string(),
    onChainDealId: v.number(),
    expectedCreator: v.string(),
  },
  returns: v.object({
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
  }),
  handler: async (_ctx, args): Promise<VerifiedDealCreated> => {
    const { receipt } = await verifyTxSucceeded(args.txHash);
    const dealEvent = await verifyDealCreatedInReceipt(receipt, {
      creator: args.expectedCreator,
      onChainDealId: args.onChainDealId,
    });

    return {
      prompt: dealEvent.prompt,
      potUsdc: Number(dealEvent.pot) / USDC_DECIMALS,
      entryCostUsdc: Number(dealEvent.entryCost) / USDC_DECIMALS,
    };
  },
});
