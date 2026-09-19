import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ADDRESS_RE } from "@margin-call/shared/address";

/**
 * Non-sensitive identity + backup pointers returned by Dynamic
 * `createWalletAccount`. The full object must be persisted so later signing
 * can recover shares from Dynamic's backup service.
 */
export type DynamicWalletMetadata = {
  walletId: string;
  accountAddress: string;
  chainName: string;
  thresholdSignatureScheme: unknown;
  [key: string]: unknown;
};

export type WalletMetadataStore = {
  path: string;
  load: () => Promise<DynamicWalletMetadata | null>;
  save: (walletMetadata: DynamicWalletMetadata) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(value: unknown): DynamicWalletMetadata {
  if (!isRecord(value)) {
    throw new Error("Wallet metadata file is malformed");
  }
  const { walletId, accountAddress, chainName, thresholdSignatureScheme } =
    value;
  if (typeof walletId !== "string" || walletId.length === 0) {
    throw new Error("Wallet metadata is missing walletId");
  }
  if (typeof accountAddress !== "string" || !ADDRESS_RE.test(accountAddress)) {
    throw new Error("Wallet metadata is missing a Base address");
  }
  if (typeof chainName !== "string" || chainName.length === 0) {
    throw new Error("Wallet metadata is missing chainName");
  }
  if (thresholdSignatureScheme === undefined) {
    throw new Error("Wallet metadata is missing thresholdSignatureScheme");
  }
  return value as DynamicWalletMetadata;
}

/**
 * File-backed store for Dynamic wallet metadata. Key shares are never written.
 */
export function fileWalletMetadataStore(filePath: string): WalletMetadataStore {
  return {
    path: filePath,
    async load() {
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.walletMetadata === undefined) {
        throw new Error("Wallet metadata file is malformed");
      }
      return parseMetadata(parsed.walletMetadata);
    },
    async save(walletMetadata) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        `${JSON.stringify({ walletMetadata }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 }
      );
    },
  };
}
