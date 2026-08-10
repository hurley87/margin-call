import { query } from "./_generated/server";

function canonicalPrivyDid(subject: string): string {
  if (!subject.startsWith("did:privy:") || subject === "did:privy:") {
    throw new Error(
      "Expected a canonical Privy DID from the verified identity"
    );
  }

  return subject;
}

/** Returns the verified Privy DID, or null if the request is unauthenticated. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return {
      did: canonicalPrivyDid(identity.subject),
    };
  },
});
