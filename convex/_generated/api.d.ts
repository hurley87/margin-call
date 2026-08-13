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
import type * as keeperAlerts from "../keeperAlerts.js";
import type * as keeperSponsorship from "../keeperSponsorship.js";
import type * as keeperTick from "../keeperTick.js";
import type * as lib_crashGameRead from "../lib/crashGameRead.js";
import type * as lib_marginCallValidators from "../lib/marginCallValidators.js";
import type * as marginCall from "../marginCall.js";
import type * as marginCallActions from "../marginCallActions.js";
import type * as me from "../me.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  keeperAlerts: typeof keeperAlerts;
  keeperSponsorship: typeof keeperSponsorship;
  keeperTick: typeof keeperTick;
  "lib/crashGameRead": typeof lib_crashGameRead;
  "lib/marginCallValidators": typeof lib_marginCallValidators;
  marginCall: typeof marginCall;
  marginCallActions: typeof marginCallActions;
  me: typeof me;
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
