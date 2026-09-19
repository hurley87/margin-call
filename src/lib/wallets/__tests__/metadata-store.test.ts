import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fileWalletMetadataStore,
  type DynamicWalletMetadata,
} from "@/lib/wallets/metadata-store";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c";

function metadata(
  overrides: Partial<DynamicWalletMetadata> = {}
): DynamicWalletMetadata {
  return {
    walletId: "wallet-1",
    accountAddress: ADDRESS,
    chainName: "EVM",
    thresholdSignatureScheme: "TWO_OF_TWO",
    externalServerKeySharesBackupInfo: { location: "dynamic" },
    ...overrides,
  };
}

describe("fileWalletMetadataStore", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true }))
    );
  });

  async function storeAt(name = "wallet.json") {
    const dir = await mkdtemp(path.join(tmpdir(), "mc-wallet-"));
    dirs.push(dir);
    return fileWalletMetadataStore(path.join(dir, name));
  }

  it("returns null when no wallet has been provisioned yet", async () => {
    const store = await storeAt();
    expect(await store.load()).toBeNull();
  });

  it("persists wallet metadata and not MPC key shares", async () => {
    const store = await storeAt();
    const walletMetadata = metadata();

    await store.save(walletMetadata);
    expect(await store.load()).toEqual(walletMetadata);

    const raw = JSON.parse(await readFile(store.path, "utf8")) as {
      walletMetadata: DynamicWalletMetadata;
      externalServerKeyShares?: unknown;
    };
    expect(raw.walletMetadata).toEqual(walletMetadata);
    expect(raw).not.toHaveProperty("externalServerKeyShares");
  });
});
