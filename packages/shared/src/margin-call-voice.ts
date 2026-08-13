/**
 * Pure helpers for the promotional desk-phone liquidation call.
 * Phone numbers must never be logged or persisted — callers discard them.
 * Ticket win/loss policy lives in crash-outcome — not here.
 */

export const MARGIN_CALL_LIQUIDATION_TWIML =
  `<Response><Say voice="Polly.Matthew">This is the desk. Your ticket has been liquidated. The crash hit first. Posted margin is gone. Don't take it personally.</Say></Response>` as const;

type PrivyPhoneUser = {
  phone?: { number?: string | null } | null;
  linkedAccounts?: Array<{ type?: string; number?: string | null }> | null;
};

/**
 * Extract an E.164 phone from a Privy user object.
 * Prefers the top-level phone account, then linked phone accounts.
 */
export function extractPrivyPhoneNumber(user: PrivyPhoneUser): string | null {
  const top = user.phone?.number?.trim();
  if (top) return top;

  for (const account of user.linkedAccounts ?? []) {
    if (account.type === "phone" && typeof account.number === "string") {
      const number = account.number.trim();
      if (number) return number;
    }
  }
  return null;
}
