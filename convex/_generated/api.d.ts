/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_chain_abis from "../lib/chain/abis.js";
import type * as lib_chain_addresses from "../lib/chain/addresses.js";
import type * as lib_chain_clients from "../lib/chain/clients.js";
import type * as lib_chain_walletAddress from "../lib/chain/walletAddress.js";
import type * as lib_poolIndexerHandlers from "../lib/poolIndexerHandlers.js";
import type * as lib_poolStats from "../lib/poolStats.js";
import type * as lib_starterGrantConfig from "../lib/starterGrantConfig.js";
import type * as lib_stockTokens from "../lib/stockTokens.js";
import type * as me from "../me.js";
import type * as pool from "../pool.js";
import type * as poolIndexer from "../poolIndexer.js";
import type * as poolIndexerActions from "../poolIndexerActions.js";
import type * as siwaNonces from "../siwaNonces.js";
import type * as starterGrantActions from "../starterGrantActions.js";
import type * as starterGrants from "../starterGrants.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  "lib/chain/abis": typeof lib_chain_abis;
  "lib/chain/addresses": typeof lib_chain_addresses;
  "lib/chain/clients": typeof lib_chain_clients;
  "lib/chain/walletAddress": typeof lib_chain_walletAddress;
  "lib/poolIndexerHandlers": typeof lib_poolIndexerHandlers;
  "lib/poolStats": typeof lib_poolStats;
  "lib/starterGrantConfig": typeof lib_starterGrantConfig;
  "lib/stockTokens": typeof lib_stockTokens;
  me: typeof me;
  pool: typeof pool;
  poolIndexer: typeof poolIndexer;
  poolIndexerActions: typeof poolIndexerActions;
  siwaNonces: typeof siwaNonces;
  starterGrantActions: typeof starterGrantActions;
  starterGrants: typeof starterGrants;
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
