import { describe, expect, it } from "vitest";
import {
  BANKROLL_SEED_TUSD_BASE,
  validateBaseSepoliaRelease,
} from "../../scripts/validate-base-sepolia-release.mjs";

const VALID_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const THIRD_ADDRESS = "0x3333333333333333333333333333333333333333";
const FOURTH_ADDRESS = "0x4444444444444444444444444444444444444444";
const FIFTH_ADDRESS = "0x5555555555555555555555555555555555555555";
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SELECTOR = "0xbc208057";

function baseRecord(overrides = {}) {
  return {
    sourceCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    chainId: 84532,
    frontend: { url: "https://margincall.fun", status: "production-ready" },
    token: VALID_ADDRESS,
    faucet: OTHER_ADDRESS,
    bankrollVault: THIRD_ADDRESS,
    marginCallCrash: FOURTH_ADDRESS,
    incoLightning: FIFTH_ADDRESS,
    bankrollSeedRecipient: VALID_ADDRESS,
    deployer: VALID_ADDRESS,
    bankrollVaultSeedDepositor: VALID_ADDRESS,
    bankrollSeedAmount: Number(BANKROLL_SEED_TUSD_BASE),
    bankrollVaultSeedAssets: Number(BANKROLL_SEED_TUSD_BASE),
    bankrollVaultMintedShares: Number(BANKROLL_SEED_TUSD_BASE),
    marginCallCrashEpochOrigin: 1_800_000_000,
    marginCallCrashRoundDuration: 60,
    marginCallCrashEntryWindow: 45,
    marginCallCrashExpiryDelay: 900,
    marginCallCrashOpenRoundSelector: SELECTOR,
    marginCallCrashEnterSelector: SELECTOR,
    marginCallCrashRequestRevealSelector: SELECTOR,
    marginCallCrashFinalizeRoundSelector: SELECTOR,
    marginCallCrashExpireRoundSelector: SELECTOR,
    bankrollVaultAcceptEntrySelector: SELECTOR,
    bankrollVaultSetAuthorizedGameSelector: SELECTOR,
    bankrollVaultDepositSelector: SELECTOR,
    tUsdApproveSelector: SELECTOR,
    faucetClaimSelector: SELECTOR,
    verification: {
      token: `https://sepolia.basescan.org/address/${VALID_ADDRESS}#code`,
      faucet: `https://sepolia.basescan.org/address/${OTHER_ADDRESS}#code`,
      bankrollVault: `https://sepolia.basescan.org/address/${THIRD_ADDRESS}#code`,
      marginCallCrash: `https://sepolia.basescan.org/address/${FOURTH_ADDRESS}#code`,
    },
    transactions: {
      deployToken: TX,
      deployFaucet: TX,
      configureFaucet: TX,
      deployBankrollVault: TX,
      approveBankrollVault: TX,
      seedBankrollVault: TX,
      deployMarginCallCrash: TX,
      setAuthorizedGame: TX,
    },
    privySponsorship: {
      appId: "cmmfbu7o900c10cjme09a31h4",
      mode: "app-pays",
      chain: "Base Sepolia",
      clientTransactionsAllowed: true,
    },
    smokeTest: { status: "pending", issue: 351 },
    ...overrides,
  };
}

function completeRecord() {
  return baseRecord({
    keeperAddress: OTHER_ADDRESS,
    contractOwner: VALID_ADDRESS,
    privySponsorship: {
      appId: "cmmfbu7o900c10cjme09a31h4",
      mode: "app-pays",
      chain: "Base Sepolia",
      clientTransactionsAllowed: true,
      policyId: "pol_test_policy",
      permittedContracts: [
        VALID_ADDRESS,
        OTHER_ADDRESS,
        THIRD_ADDRESS,
        FOURTH_ADDRESS,
      ],
      permittedSelectors: [
        SELECTOR,
        "0x4e71d92d",
        "0x6e553f65",
        "0x095ea7b3",
        "0xbde22ae0",
      ],
    },
    smokeTest: {
      status: "complete",
      issue: 351,
      game: FOURTH_ADDRESS,
      vault: THIRD_ADDRESS,
      completeRound: {
        approve: TX,
        enter: TX,
        requestReveal: TX,
        finalizeRound: TX,
        claimOrSettleLoss: TX,
      },
      expiredRefundRound: {
        approveOrReuseAllowance: TX,
        enter: TX,
        expireRound: TX,
        refund: TX,
      },
      lpFlows: {
        approve: TX,
        deposit: TX,
        withdraw: TX,
        rejectedOverLimitWithdrawal: {
          fundsMoved: false,
          evidence:
            "UI showed over-limit error; wallet/share balances unchanged",
        },
      },
      liveObservations: {
        overlappingRoundsVerified: true,
        idleEpochNoStateVerified: true,
        ticketlessPreopenNoExposureVerified: true,
        globalHistoryFinalizedRounds: 20,
        zeroEthWalletThroughout: true,
        transactionPendingRecoveryAudited: true,
      },
      sponsorshipVerification: {
        inPolicySponsoredCallsSucceeded: true,
        outOfPolicyCallRejected: true,
      },
    },
  });
}

describe("validateBaseSepoliaRelease", () => {
  it("accepts a structural deploy record", () => {
    const result = validateBaseSepoliaRelease(baseRecord());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects mainnet chain ids and zero addresses", () => {
    const result = validateBaseSepoliaRelease(
      baseRecord({
        chainId: 1,
        token: "0x0000000000000000000000000000000000000000",
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("84532"))).toBe(true);
    expect(result.errors.some((e) => e.includes("token"))).toBe(true);
  });

  it("rejects secret-shaped field names", () => {
    const result = validateBaseSepoliaRelease(
      baseRecord({ KEEPER_PRIVATE_KEY: "0xabc" })
    );
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("forbidden secret-shaped"))
    ).toBe(true);
  });

  it("warns when vault seed is below 25,000 tUSD outside --release-complete", () => {
    const result = validateBaseSepoliaRelease(
      baseRecord({ bankrollVaultSeedAssets: 20_000_000_000 })
    );
    expect(result.ok).toBe(true);
    expect(
      result.warnings.some((w) => w.includes("bankrollVaultSeedAssets"))
    ).toBe(true);
  });

  it("requires full smoke evidence under --release-complete", () => {
    const incomplete = validateBaseSepoliaRelease(baseRecord(), {
      releaseComplete: true,
    });
    expect(incomplete.ok).toBe(false);
    expect(
      incomplete.errors.some((e) =>
        e.includes('smokeTest.status must be "complete"')
      )
    ).toBe(true);

    const complete = validateBaseSepoliaRelease(completeRecord(), {
      releaseComplete: true,
    });
    expect(complete.errors).toEqual([]);
    expect(complete.ok).toBe(true);
  });
});
