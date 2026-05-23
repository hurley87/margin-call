import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT } from "./setup";

const mockIdentity = {
  subject: "did:privy:desk-manager-wallet",
  tokenIdentifier: "did:privy:desk-manager-wallet",
  issuer: "https://auth.privy.io",
};

describe("deskManagers.upsertMe wallet persistence", () => {
  it("stores the first wallet address and does not rotate it on later upserts", async () => {
    const t = makeT();
    const authed = t.withIdentity(mockIdentity);

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0x1111111111111111111111111111111111111111",
      displayName: "First wallet",
    });

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0x2222222222222222222222222222222222222222",
      displayName: "Updated display",
    });

    const deskManager = await authed.query(api.deskManagers.getMe, {});

    expect(deskManager?.walletAddress).toBe(
      "0x1111111111111111111111111111111111111111"
    );
    expect(deskManager?.displayName).toBe("Updated display");
  });
});
