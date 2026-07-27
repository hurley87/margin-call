/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_resetEscrowState from "../admin/resetEscrowState.js";
import type * as agent__constants from "../agent/_constants.js";
import type * as agent__ctx from "../agent/_ctx.js";
import type * as agent__evaluator from "../agent/_evaluator.js";
import type * as agent__schemas from "../agent/_schemas.js";
import type * as agent__types from "../agent/_types.js";
import type * as agent_capacity from "../agent/capacity.js";
import type * as agent_cycle from "../agent/cycle.js";
import type * as agent_dealSelection from "../agent/dealSelection.js";
import type * as agent_internal from "../agent/internal.js";
import type * as agent_onChainSettlement from "../agent/onChainSettlement.js";
import type * as agent_outcomeResolver from "../agent/outcomeResolver.js";
import type * as agent_reconcileEntries from "../agent/reconcileEntries.js";
import type * as agent_scheduler from "../agent/scheduler.js";
import type * as agentActivityLog from "../agentActivityLog.js";
import type * as assets from "../assets.js";
import type * as crons from "../crons.js";
import type * as dealApprovals from "../dealApprovals.js";
import type * as dealOutcomes from "../dealOutcomes.js";
import type * as deals from "../deals.js";
import type * as debug from "../debug.js";
import type * as deskManagers from "../deskManagers.js";
import type * as emailNotifications from "../emailNotifications.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_dealEntryEligibility from "../lib/dealEntryEligibility.js";
import type * as lib_extractionCap from "../lib/extractionCap.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_portraitChecks from "../lib/portraitChecks.js";
import type * as lib_portraitSeed from "../lib/portraitSeed.js";
import type * as lib_profileImage from "../lib/profileImage.js";
import type * as lib_resolveAddress from "../lib/resolveAddress.js";
import type * as lib_settlementEncoding from "../lib/settlementEncoding.js";
import type * as lib_tradingHours from "../lib/tradingHours.js";
import type * as marketNarratives from "../marketNarratives.js";
import type * as me from "../me.js";
import type * as ops__batchDelete from "../ops/_batchDelete.js";
import type * as ops_clearNarrativeWorld from "../ops/clearNarrativeWorld.js";
import type * as ops_resetGameState from "../ops/resetGameState.js";
import type * as ops_resetNarrative from "../ops/resetNarrative.js";
import type * as ops_wipeSmokeTraders from "../ops/wipeSmokeTraders.js";
import type * as portfolio from "../portfolio.js";
import type * as portraits from "../portraits.js";
import type * as seasons from "../seasons.js";
import type * as seeds_systemPrompts from "../seeds/systemPrompts.js";
import type * as seeds_wireSeason01 from "../seeds/wireSeason01.js";
import type * as siwaNonces from "../siwaNonces.js";
import type * as systemPrompts from "../systemPrompts.js";
import type * as traders from "../traders.js";
import type * as wallet from "../wallet.js";
import type * as wire__operatorUtils from "../wire/_operatorUtils.js";
import type * as wire__schemas from "../wire/_schemas.js";
import type * as wire_arcTemplates from "../wire/arcTemplates.js";
import type * as wire_dealTweet from "../wire/dealTweet.js";
import type * as wire_dealTweetStore from "../wire/dealTweetStore.js";
import type * as wire_dealTweetText from "../wire/dealTweetText.js";
import type * as wire_dramaRanker from "../wire/dramaRanker.js";
import type * as wire_dropAngles from "../wire/dropAngles.js";
import type * as wire_epochAssembler from "../wire/epochAssembler.js";
import type * as wire_epochNormalizer from "../wire/epochNormalizer.js";
import type * as wire_epochValidator from "../wire/epochValidator.js";
import type * as wire_generator from "../wire/generator.js";
import type * as wire_internal from "../wire/internal.js";
import type * as wire_operatorActions from "../wire/operatorActions.js";
import type * as wire_operatorMutations from "../wire/operatorMutations.js";
import type * as wire_operatorQueries from "../wire/operatorQueries.js";
import type * as wire_persist from "../wire/persist.js";
import type * as wire_priceConfig from "../wire/priceConfig.js";
import type * as wire_pricePoll from "../wire/pricePoll.js";
import type * as wire_priceStore from "../wire/priceStore.js";
import type * as wire_registrySync from "../wire/registrySync.js";
import type * as wire_stages from "../wire/stages.js";
import type * as wire_tokenRegistry from "../wire/tokenRegistry.js";
import type * as wire_tokenSignals from "../wire/tokenSignals.js";
import type * as wire_tradingHours from "../wire/tradingHours.js";
import type * as wire_tweetOps from "../wire/tweetOps.js";
import type * as wire_tweetPoster from "../wire/tweetPoster.js";
import type * as wire_tweetVariant from "../wire/tweetVariant.js";
import type * as wire_worldState from "../wire/worldState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/resetEscrowState": typeof admin_resetEscrowState;
  "agent/_constants": typeof agent__constants;
  "agent/_ctx": typeof agent__ctx;
  "agent/_evaluator": typeof agent__evaluator;
  "agent/_schemas": typeof agent__schemas;
  "agent/_types": typeof agent__types;
  "agent/capacity": typeof agent_capacity;
  "agent/cycle": typeof agent_cycle;
  "agent/dealSelection": typeof agent_dealSelection;
  "agent/internal": typeof agent_internal;
  "agent/onChainSettlement": typeof agent_onChainSettlement;
  "agent/outcomeResolver": typeof agent_outcomeResolver;
  "agent/reconcileEntries": typeof agent_reconcileEntries;
  "agent/scheduler": typeof agent_scheduler;
  agentActivityLog: typeof agentActivityLog;
  assets: typeof assets;
  crons: typeof crons;
  dealApprovals: typeof dealApprovals;
  dealOutcomes: typeof dealOutcomes;
  deals: typeof deals;
  debug: typeof debug;
  deskManagers: typeof deskManagers;
  emailNotifications: typeof emailNotifications;
  emails: typeof emails;
  http: typeof http;
  leaderboard: typeof leaderboard;
  "lib/dealEntryEligibility": typeof lib_dealEntryEligibility;
  "lib/extractionCap": typeof lib_extractionCap;
  "lib/limits": typeof lib_limits;
  "lib/portraitChecks": typeof lib_portraitChecks;
  "lib/portraitSeed": typeof lib_portraitSeed;
  "lib/profileImage": typeof lib_profileImage;
  "lib/resolveAddress": typeof lib_resolveAddress;
  "lib/settlementEncoding": typeof lib_settlementEncoding;
  "lib/tradingHours": typeof lib_tradingHours;
  marketNarratives: typeof marketNarratives;
  me: typeof me;
  "ops/_batchDelete": typeof ops__batchDelete;
  "ops/clearNarrativeWorld": typeof ops_clearNarrativeWorld;
  "ops/resetGameState": typeof ops_resetGameState;
  "ops/resetNarrative": typeof ops_resetNarrative;
  "ops/wipeSmokeTraders": typeof ops_wipeSmokeTraders;
  portfolio: typeof portfolio;
  portraits: typeof portraits;
  seasons: typeof seasons;
  "seeds/systemPrompts": typeof seeds_systemPrompts;
  "seeds/wireSeason01": typeof seeds_wireSeason01;
  siwaNonces: typeof siwaNonces;
  systemPrompts: typeof systemPrompts;
  traders: typeof traders;
  wallet: typeof wallet;
  "wire/_operatorUtils": typeof wire__operatorUtils;
  "wire/_schemas": typeof wire__schemas;
  "wire/arcTemplates": typeof wire_arcTemplates;
  "wire/dealTweet": typeof wire_dealTweet;
  "wire/dealTweetStore": typeof wire_dealTweetStore;
  "wire/dealTweetText": typeof wire_dealTweetText;
  "wire/dramaRanker": typeof wire_dramaRanker;
  "wire/dropAngles": typeof wire_dropAngles;
  "wire/epochAssembler": typeof wire_epochAssembler;
  "wire/epochNormalizer": typeof wire_epochNormalizer;
  "wire/epochValidator": typeof wire_epochValidator;
  "wire/generator": typeof wire_generator;
  "wire/internal": typeof wire_internal;
  "wire/operatorActions": typeof wire_operatorActions;
  "wire/operatorMutations": typeof wire_operatorMutations;
  "wire/operatorQueries": typeof wire_operatorQueries;
  "wire/persist": typeof wire_persist;
  "wire/priceConfig": typeof wire_priceConfig;
  "wire/pricePoll": typeof wire_pricePoll;
  "wire/priceStore": typeof wire_priceStore;
  "wire/registrySync": typeof wire_registrySync;
  "wire/stages": typeof wire_stages;
  "wire/tokenRegistry": typeof wire_tokenRegistry;
  "wire/tokenSignals": typeof wire_tokenSignals;
  "wire/tradingHours": typeof wire_tradingHours;
  "wire/tweetOps": typeof wire_tweetOps;
  "wire/tweetPoster": typeof wire_tweetPoster;
  "wire/tweetVariant": typeof wire_tweetVariant;
  "wire/worldState": typeof wire_worldState;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
