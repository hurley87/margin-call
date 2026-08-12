#!/usr/bin/env node
/**
 * Validates the curated Base Sepolia release record
 * (`contracts/deployments/base_sepolia.json`) against PRD §12 / issue #351.
 *
 * Modes:
 *   (default)          Structural deploy record: chain, addresses, timing,
 *                      selectors, seed mint amount, no secret-shaped fields.
 *   --release-complete Full release: vault seeded ≥ 25,000 tUSD, keeper,
 *                      owner, complete smoke transaction sets, Privy policy
 *                      identifiers, and live-observation fields.
 *
 * Never prints secret values — only field names and expected shapes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BANKROLL_SEED_TUSD_BASE = 25_000_000_000n; // 25,000 * 10^6
export const ROUND_DURATION = 60;
export const ENTRY_WINDOW = 45;
export const EXPIRY_DELAY = 900;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const SELECTOR_RE = /^0x[a-fA-F0-9]{8}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;

/** Field names that must never appear with secret-looking values. */
export const FORBIDDEN_SECRET_KEYS = [
  "privateKey",
  "private_key",
  "PRIVY_APP_SECRET",
  "privyAppSecret",
  "appSecret",
  "OPERATOR_PRIVATE_KEY",
  "KEEPER_PRIVATE_KEY",
  "mnemonic",
  "seedPhrase",
  "authorizationSignature",
  "accessToken",
  "sessionToken",
  "phoneNumber",
  "phone",
];

const REQUIRED_SELECTORS = [
  "marginCallCrashOpenRoundSelector",
  "marginCallCrashEnterSelector",
  "marginCallCrashRequestRevealSelector",
  "marginCallCrashFinalizeRoundSelector",
  "marginCallCrashExpireRoundSelector",
  "bankrollVaultAcceptEntrySelector",
  "bankrollVaultSetAuthorizedGameSelector",
  "bankrollVaultDepositSelector",
  "tUsdApproveSelector",
  "faucetClaimSelector",
];

const REQUIRED_DEPLOY_TXS = [
  "deployToken",
  "deployFaucet",
  "configureFaucet",
  "deployBankrollVault",
  "approveBankrollVault",
  "seedBankrollVault",
  "deployMarginCallCrash",
  "setAuthorizedGame",
];

const REQUIRED_VERIFICATION = [
  "token",
  "faucet",
  "bankrollVault",
  "marginCallCrash",
];

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isTxHash(value) {
  return typeof value === "string" && TX_HASH_RE.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isSelector(value) {
  return typeof value === "string" && SELECTOR_RE.test(value);
}

/**
 * Walks the record for forbidden secret key names.
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} issues
 */
function collectSecretKeyIssues(value, path, issues) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSecretKeyIssues(item, `${path}[${index}]`, issues)
    );
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (
      FORBIDDEN_SECRET_KEYS.some(
        (forbidden) => forbidden.toLowerCase() === key.toLowerCase()
      )
    ) {
      issues.push(
        `${next}: forbidden secret-shaped field name (identifiers only; never secrets)`
      );
    }
    collectSecretKeyIssues(child, next, issues);
  }
}

/**
 * @param {Record<string, unknown>} record
 * @param {{ releaseComplete?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateBaseSepoliaRelease(record, options = {}) {
  const errors = [];
  const warnings = [];
  const releaseComplete = options.releaseComplete === true;

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      ok: false,
      errors: ["record must be a JSON object"],
      warnings,
    };
  }

  collectSecretKeyIssues(record, "", errors);

  if (record.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    errors.push(
      `chainId must be ${BASE_SEPOLIA_CHAIN_ID} (Base Sepolia); got ${String(record.chainId)}`
    );
  }

  if (
    typeof record.sourceCommit !== "string" ||
    !COMMIT_RE.test(record.sourceCommit)
  ) {
    errors.push("sourceCommit must be a 40-character lowercase git SHA");
  }

  const addressFields = [
    "token",
    "faucet",
    "bankrollVault",
    "marginCallCrash",
    "incoLightning",
    "bankrollSeedRecipient",
    "deployer",
    "bankrollVaultSeedDepositor",
  ];
  /** @type {Record<string, string>} */
  const addresses = {};
  for (const field of addressFields) {
    const value = record[field];
    if (
      !isAddress(value) ||
      value.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    ) {
      errors.push(`${field} must be a non-zero 0x-prefixed address`);
      continue;
    }
    addresses[field] = value.toLowerCase();
  }

  const distinctPairs = [
    ["token", "faucet"],
    ["token", "bankrollVault"],
    ["token", "marginCallCrash"],
    ["faucet", "bankrollVault"],
    ["faucet", "marginCallCrash"],
    ["bankrollVault", "marginCallCrash"],
  ];
  for (const [left, right] of distinctPairs) {
    if (
      addresses[left] &&
      addresses[right] &&
      addresses[left] === addresses[right]
    ) {
      errors.push(`${left} and ${right} must be distinct addresses`);
    }
  }

  if (
    addresses.deployer &&
    addresses.bankrollSeedRecipient &&
    addresses.deployer !== addresses.bankrollSeedRecipient
  ) {
    errors.push(
      "deployer must match bankrollSeedRecipient for the seed workflow"
    );
  }
  if (
    addresses.bankrollVaultSeedDepositor &&
    addresses.bankrollSeedRecipient &&
    addresses.bankrollVaultSeedDepositor !== addresses.bankrollSeedRecipient
  ) {
    errors.push(
      "bankrollVaultSeedDepositor must match bankrollSeedRecipient for the seed workflow"
    );
  }

  if (record.bankrollSeedAmount !== Number(BANKROLL_SEED_TUSD_BASE)) {
    errors.push(
      `bankrollSeedAmount must be ${BANKROLL_SEED_TUSD_BASE.toString()} (25,000 tUSD base units)`
    );
  }

  if (record.marginCallCrashRoundDuration !== ROUND_DURATION) {
    errors.push(`marginCallCrashRoundDuration must be ${ROUND_DURATION}`);
  }
  if (record.marginCallCrashEntryWindow !== ENTRY_WINDOW) {
    errors.push(`marginCallCrashEntryWindow must be ${ENTRY_WINDOW}`);
  }
  if (record.marginCallCrashExpiryDelay !== EXPIRY_DELAY) {
    errors.push(`marginCallCrashExpiryDelay must be ${EXPIRY_DELAY}`);
  }

  if (
    typeof record.marginCallCrashEpochOrigin !== "number" ||
    record.marginCallCrashEpochOrigin % 60 !== 0
  ) {
    errors.push(
      "marginCallCrashEpochOrigin must be a minute-aligned Unix timestamp"
    );
  }

  for (const field of REQUIRED_SELECTORS) {
    if (!isSelector(record[field])) {
      errors.push(`${field} must be an 0x-prefixed 4-byte selector`);
    }
  }

  const verification = record.verification;
  if (!verification || typeof verification !== "object") {
    errors.push("verification must be an object of Basescan URLs");
  } else {
    for (const field of REQUIRED_VERIFICATION) {
      const url = /** @type {Record<string, unknown>} */ (verification)[field];
      if (
        typeof url !== "string" ||
        !url.startsWith("https://sepolia.basescan.org/address/")
      ) {
        errors.push(
          `verification.${field} must be a sepolia.basescan.org address URL`
        );
      }
    }
  }

  const transactions = record.transactions;
  if (!transactions || typeof transactions !== "object") {
    errors.push("transactions must be an object of deploy/seed hashes");
  } else {
    for (const field of REQUIRED_DEPLOY_TXS) {
      if (
        !isTxHash(/** @type {Record<string, unknown>} */ (transactions)[field])
      ) {
        errors.push(`transactions.${field} must be a 32-byte hex hash`);
      }
    }
  }

  const frontend = record.frontend;
  if (!frontend || typeof frontend !== "object") {
    errors.push("frontend must be an object with url/status");
  } else {
    const fe = /** @type {Record<string, unknown>} */ (frontend);
    if (typeof fe.url !== "string" || !fe.url.startsWith("https://")) {
      errors.push("frontend.url must be an https URL");
    }
    if (typeof fe.status !== "string" || fe.status.length === 0) {
      errors.push("frontend.status must be a non-empty string");
    }
  }

  const privy = record.privySponsorship;
  if (!privy || typeof privy !== "object") {
    errors.push("privySponsorship must be present (identifiers only)");
  } else {
    const p = /** @type {Record<string, unknown>} */ (privy);
    if (typeof p.appId !== "string" || p.appId.length < 8) {
      errors.push("privySponsorship.appId must be a Privy app identifier");
    }
    if (p.mode !== "app-pays") {
      errors.push('privySponsorship.mode must be "app-pays"');
    }
    if (p.chain !== "Base Sepolia") {
      errors.push('privySponsorship.chain must be "Base Sepolia"');
    }
    if (p.clientTransactionsAllowed !== true) {
      errors.push("privySponsorship.clientTransactionsAllowed must be true");
    }
  }

  // Mainnet / production address silent-fallback checks
  const serialized = JSON.stringify(record);
  if (/"chainId"\s*:\s*1\b/.test(serialized) || /eip155:1/.test(serialized)) {
    errors.push("record must not contain Ethereum mainnet chain references");
  }

  const vaultSeed = record.bankrollVaultSeedAssets;
  const vaultShares = record.bankrollVaultMintedShares;
  if (releaseComplete) {
    if (vaultSeed !== Number(BANKROLL_SEED_TUSD_BASE)) {
      errors.push(
        `bankrollVaultSeedAssets must be ${BANKROLL_SEED_TUSD_BASE.toString()} for a complete release`
      );
    }
    if (vaultShares !== Number(BANKROLL_SEED_TUSD_BASE)) {
      errors.push(
        `bankrollVaultMintedShares must be ${BANKROLL_SEED_TUSD_BASE.toString()} for a complete release`
      );
    }

    if (
      !isAddress(record.keeperAddress) ||
      record.keeperAddress === ZERO_ADDRESS
    ) {
      errors.push("keeperAddress must be a non-zero public EOA address");
    }
    if (
      !isAddress(record.contractOwner) ||
      record.contractOwner === ZERO_ADDRESS
    ) {
      errors.push("contractOwner must be a non-zero public address");
    }

    const smoke = record.smokeTest;
    if (!smoke || typeof smoke !== "object") {
      errors.push("smokeTest must be present for a complete release");
    } else {
      const s = /** @type {Record<string, unknown>} */ (smoke);
      if (s.status !== "complete") {
        errors.push('smokeTest.status must be "complete"');
      }
      if (s.issue !== 351) {
        errors.push("smokeTest.issue must be 351");
      }
      if (!isAddress(s.game) || !isAddress(s.vault)) {
        errors.push("smokeTest.game and smokeTest.vault must be addresses");
      }
      if (
        addresses.marginCallCrash &&
        isAddress(s.game) &&
        s.game.toLowerCase() !== addresses.marginCallCrash
      ) {
        errors.push("smokeTest.game must match marginCallCrash");
      }
      if (
        addresses.bankrollVault &&
        isAddress(s.vault) &&
        s.vault.toLowerCase() !== addresses.bankrollVault
      ) {
        errors.push("smokeTest.vault must match bankrollVault");
      }

      const completeRound = s.completeRound;
      if (!completeRound || typeof completeRound !== "object") {
        errors.push("smokeTest.completeRound transaction set is required");
      } else {
        for (const field of [
          "approve",
          "enter",
          "requestReveal",
          "finalizeRound",
          "claimOrSettleLoss",
        ]) {
          if (
            !isTxHash(
              /** @type {Record<string, unknown>} */ (completeRound)[field]
            )
          ) {
            errors.push(`smokeTest.completeRound.${field} must be a tx hash`);
          }
        }
      }

      const expired = s.expiredRefundRound;
      if (!expired || typeof expired !== "object") {
        errors.push("smokeTest.expiredRefundRound transaction set is required");
      } else {
        for (const field of [
          "approveOrReuseAllowance",
          "enter",
          "expireRound",
          "refund",
        ]) {
          if (
            !isTxHash(/** @type {Record<string, unknown>} */ (expired)[field])
          ) {
            errors.push(
              `smokeTest.expiredRefundRound.${field} must be a tx hash`
            );
          }
        }
      }

      const lp = s.lpFlows;
      if (!lp || typeof lp !== "object") {
        errors.push("smokeTest.lpFlows transaction set is required");
      } else {
        for (const field of ["approve", "deposit", "withdraw"]) {
          if (!isTxHash(/** @type {Record<string, unknown>} */ (lp)[field])) {
            errors.push(`smokeTest.lpFlows.${field} must be a tx hash`);
          }
        }
        const rejected = /** @type {Record<string, unknown>} */ (lp)
          .rejectedOverLimitWithdrawal;
        if (!rejected || typeof rejected !== "object") {
          errors.push(
            "smokeTest.lpFlows.rejectedOverLimitWithdrawal evidence is required"
          );
        } else {
          const r = /** @type {Record<string, unknown>} */ (rejected);
          if (r.fundsMoved !== false) {
            errors.push(
              "smokeTest.lpFlows.rejectedOverLimitWithdrawal.fundsMoved must be false"
            );
          }
          if (typeof r.evidence !== "string" || r.evidence.length === 0) {
            errors.push(
              "smokeTest.lpFlows.rejectedOverLimitWithdrawal.evidence must describe the revert"
            );
          }
        }
      }

      const observations = s.liveObservations;
      if (!observations || typeof observations !== "object") {
        errors.push("smokeTest.liveObservations is required");
      } else {
        const o = /** @type {Record<string, unknown>} */ (observations);
        if (o.overlappingRoundsVerified !== true) {
          errors.push(
            "smokeTest.liveObservations.overlappingRoundsVerified must be true"
          );
        }
        if (o.idleEpochNoStateVerified !== true) {
          errors.push(
            "smokeTest.liveObservations.idleEpochNoStateVerified must be true"
          );
        }
        if (o.ticketlessPreopenNoExposureVerified !== true) {
          errors.push(
            "smokeTest.liveObservations.ticketlessPreopenNoExposureVerified must be true"
          );
        }
        if (
          typeof o.globalHistoryFinalizedRounds !== "number" ||
          o.globalHistoryFinalizedRounds < 20
        ) {
          errors.push(
            "smokeTest.liveObservations.globalHistoryFinalizedRounds must be ≥ 20"
          );
        }
        if (o.zeroEthWalletThroughout !== true) {
          errors.push(
            "smokeTest.liveObservations.zeroEthWalletThroughout must be true"
          );
        }
        if (o.transactionPendingRecoveryAudited !== true) {
          errors.push(
            "smokeTest.liveObservations.transactionPendingRecoveryAudited must be true"
          );
        }
      }

      const sponsorship = s.sponsorshipVerification;
      if (!sponsorship || typeof sponsorship !== "object") {
        errors.push("smokeTest.sponsorshipVerification is required");
      } else {
        const sp = /** @type {Record<string, unknown>} */ (sponsorship);
        if (sp.inPolicySponsoredCallsSucceeded !== true) {
          errors.push(
            "smokeTest.sponsorshipVerification.inPolicySponsoredCallsSucceeded must be true"
          );
        }
        if (sp.outOfPolicyCallRejected !== true) {
          errors.push(
            "smokeTest.sponsorshipVerification.outOfPolicyCallRejected must be true"
          );
        }
      }
    }

    if (privy && typeof privy === "object") {
      const p = /** @type {Record<string, unknown>} */ (privy);
      if (typeof p.policyId !== "string" || p.policyId.length === 0) {
        errors.push(
          "privySponsorship.policyId must record the dashboard policy identifier"
        );
      }
      const allowlist = p.permittedContracts;
      if (!Array.isArray(allowlist) || allowlist.length < 3) {
        errors.push(
          "privySponsorship.permittedContracts must list the deployed token/faucet/vault/game addresses"
        );
      }
      const selectors = p.permittedSelectors;
      if (!Array.isArray(selectors) || selectors.length < 5) {
        errors.push(
          "privySponsorship.permittedSelectors must list the sponsored call selectors"
        );
      }
    }
  } else {
    if (
      typeof vaultSeed === "number" &&
      vaultSeed < Number(BANKROLL_SEED_TUSD_BASE)
    ) {
      warnings.push(
        `bankrollVaultSeedAssets is ${vaultSeed} (< 25,000 tUSD); top up or redeploy before --release-complete`
      );
    }
    const smoke = record.smokeTest;
    if (
      smoke &&
      typeof smoke === "object" &&
      /** @type {Record<string, unknown>} */ (smoke).status !== "complete"
    ) {
      warnings.push(
        `smokeTest.status is "${String(/** @type {Record<string, unknown>} */ (smoke).status)}" — finish guided smoke before --release-complete`
      );
    }
    if (!isAddress(record.keeperAddress)) {
      warnings.push(
        "keeperAddress not yet recorded (required for --release-complete)"
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * @param {string} [recordPath]
 * @param {{ releaseComplete?: boolean }} [options]
 */
export function validateReleaseRecordFile(recordPath, options = {}) {
  const path =
    recordPath ??
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "contracts",
      "deployments",
      "base_sepolia.json"
    );
  const record = JSON.parse(readFileSync(path, "utf8"));
  return { path, ...validateBaseSepoliaRelease(record, options) };
}

function main() {
  const args = process.argv.slice(2);
  const releaseComplete = args.includes("--release-complete");
  const pathArg = args.find((arg) => !arg.startsWith("--"));
  const result = validateReleaseRecordFile(pathArg, { releaseComplete });

  if (result.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  if (!result.ok) {
    console.error(`✗ ${result.path} failed validation`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `✓ ${result.path} valid${releaseComplete ? " (release-complete)" : " (deploy record)"}`
  );
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  return (
    entry.endsWith("validate-base-sepolia-release.mjs") ||
    entry.endsWith("validate-base-sepolia-release")
  );
}

if (isCliEntry()) {
  main();
}
