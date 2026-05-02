/**
 * Re-export the Convex ActionCtx type under an alias used across cycle modules.
 * Avoids circular import issues when helpers need the ctx type.
 */

import type { ActionCtx } from "../_generated/server";

export type RunActionCtx = ActionCtx;
