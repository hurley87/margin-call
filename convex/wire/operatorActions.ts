"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertOperatorSubject } from "./_operatorUtils";

type GenerateResult =
  | { skipped: "outside-market-hours" | "duplicate-slot" }
  | { skipped: "validation-failed"; error: string }
  | { inserted: boolean; dropId: string; epoch?: number };

type ResetResult = {
  cleared: {
    deletedNarratives: number;
    deletedSeeds: number;
    deletedSeedLinks: number;
  };
  imported: {
    seasonId: string;
    companiesSynced: number;
    companiesRemoved: number;
  };
};

export const forceGenerateDrop = action({
  args: {},
  handler: async (ctx): Promise<GenerateResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertOperatorSubject(identity.subject);

    return ctx.runAction(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
    }) as Promise<GenerateResult>;
  },
});

export const resetNarrativeState = action({
  args: {},
  handler: async (ctx): Promise<ResetResult> => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Reset is not available in production");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertOperatorSubject(identity.subject);

    const cleared = (await ctx.runMutation(
      internal.wire.operatorMutations.clearNarrativeState,
      {}
    )) as ResetResult["cleared"];

    const imported = (await ctx.runMutation(
      internal.seasons.importSeason,
      {}
    )) as ResetResult["imported"];

    return { cleared, imported };
  },
});
