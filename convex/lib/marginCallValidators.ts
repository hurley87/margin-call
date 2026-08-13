import { v } from "convex/values";

/** Reasons stored on attempts or returned when requestMarginCall no-ops. */
export const marginCallAttemptReason = v.union(
  v.literal("not_opted_in"),
  v.literal("wallet_mismatch"),
  v.literal("already_attempted"),
  v.literal("voice_disabled"),
  v.literal("missing_credentials"),
  v.literal("not_a_loss"),
  v.literal("player_mismatch"),
  v.literal("round_mismatch"),
  v.literal("no_phone"),
  v.literal("twilio_error")
);

export type MarginCallAttemptReason =
  | "not_opted_in"
  | "wallet_mismatch"
  | "already_attempted"
  | "voice_disabled"
  | "missing_credentials"
  | "not_a_loss"
  | "player_mismatch"
  | "round_mismatch"
  | "no_phone"
  | "twilio_error";

export type MarginCallActionSkipReason = Exclude<
  MarginCallAttemptReason,
  "wallet_mismatch" | "already_attempted"
>;

export const marginCallRequestSkipReason = v.union(
  v.literal("not_opted_in"),
  v.literal("wallet_mismatch"),
  v.literal("already_attempted")
);

export const marginCallAttemptStatus = v.union(
  v.literal("pending"),
  v.literal("placed"),
  v.literal("skipped"),
  v.literal("failed")
);

export const marginCallTerminalStatus = v.union(
  v.literal("placed"),
  v.literal("skipped"),
  v.literal("failed")
);
