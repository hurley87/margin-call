/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent__constants from "../agent/_constants.js";
import type * as agent__ctx from "../agent/_ctx.js";
import type * as agent__evaluator from "../agent/_evaluator.js";
import type * as agent__schemas from "../agent/_schemas.js";
import type * as agent__types from "../agent/_types.js";
import type * as agent_cycle from "../agent/cycle.js";
import type * as agent_dealSelection from "../agent/dealSelection.js";
import type * as agent_internal from "../agent/internal.js";
import type * as agent_outcomeResolver from "../agent/outcomeResolver.js";
import type * as agent_scheduler from "../agent/scheduler.js";
import type * as agentActivityLog from "../agentActivityLog.js";
import type * as assets from "../assets.js";
import type * as crons from "../crons.js";
import type * as dealApprovals from "../dealApprovals.js";
import type * as dealOutcomes from "../dealOutcomes.js";
import type * as deals from "../deals.js";
import type * as deskManagers from "../deskManagers.js";
import type * as marketNarratives from "../marketNarratives.js";
import type * as me from "../me.js";
import type * as siwaNonces from "../siwaNonces.js";
import type * as systemPrompts from "../systemPrompts.js";
import type * as traders from "../traders.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/_constants": typeof agent__constants;
  "agent/_ctx": typeof agent__ctx;
  "agent/_evaluator": typeof agent__evaluator;
  "agent/_schemas": typeof agent__schemas;
  "agent/_types": typeof agent__types;
  "agent/cycle": typeof agent_cycle;
  "agent/dealSelection": typeof agent_dealSelection;
  "agent/internal": typeof agent_internal;
  "agent/outcomeResolver": typeof agent_outcomeResolver;
  "agent/scheduler": typeof agent_scheduler;
  agentActivityLog: typeof agentActivityLog;
  assets: typeof assets;
  crons: typeof crons;
  dealApprovals: typeof dealApprovals;
  dealOutcomes: typeof dealOutcomes;
  deals: typeof deals;
  deskManagers: typeof deskManagers;
  marketNarratives: typeof marketNarratives;
  me: typeof me;
  siwaNonces: typeof siwaNonces;
  systemPrompts: typeof systemPrompts;
  traders: typeof traders;
  wallet: typeof wallet;
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
