/**
 * Agent runtime constants shared across cycle pipeline modules.
 * Mirrors src/lib/constants.ts — kept in sync manually.
 */

/** Skip deals another trader on the same desk entered within this window. */
export const DESK_DEAL_DEDUP_HOURS = 24;

/** 10% rake on winnings. */
export const RAKE_PERCENTAGE = 10;

/** 25% of pot per win (max extraction). */
export const MAX_EXTRACTION_PERCENTAGE = 25;

/** Approval expiry: 24 hours from request time. */
export const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000;
