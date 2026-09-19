import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileWalletMetadataStore } from "@/lib/wallets/metadata-store";
import { provisionOrResolveDynamicWallet } from "@/lib/wallets/dynamic-server";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c";

const walletMetadata = {
  walletId: "wallet-1",
  accountAddress: ADDRESS,
  chainName: "EVM",
  thresholdSignatureScheme: "TWO_OF_TWO",
  externalServerKeySharesBackupInfo: { location: "dynamic" },
};

describe("provisionOrResolveDynamicWallet", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true }))
    );
  });

  async function store() {
    const dir = await mkdtemp(path.join(tmpdir(), "mc-wallet-"));
    dirs.push(dir);
    return fileWalletMetadataStore(path.join(dir, "wallet.json"));
  }

  it("creates a Dynamic wallet when none exists and stores metadata, not key shares", async () => {
    const metadataStore = await store();
    const createWalletAccount = vi.fn(async () => ({
      walletMetadata,
      externalServerKeyShares: [{ share: "secret-share-must-not-be-saved" }],
    }));

    const result = await provisionOrResolveDynamicWallet({
      client: { createWalletAccount },
      store: metadataStore,
      password: "test-password",
    });

    expect(result).toEqual({ walletMetadata, created: true });
    expect(createWalletAccount).toHaveBeenCalledWith({
      password: "test-password",
      backUpToDynamic: true,
    });

    const onDisk = JSON.parse(await readFile(metadataStore.path, "utf8")) as {
      walletMetadata: unknown;
      externalServerKeyShares?: unknown;
    };
    expect(onDisk.walletMetadata).toEqual(walletMetadata);
    expect(onDisk).not.toHaveProperty("externalServerKeyShares");
    expect(JSON.stringify(onDisk)).not.toContain(
      "secret-share-must-not-be-saved"
    );
  });

  it("resolves the stored wallet without creating another", async () => {
    const metadataStore = await store();
    await metadataStore.save(walletMetadata);
    const createWalletAccount = vi.fn();

    const result = await provisionOrResolveDynamicWallet({
      client: { createWalletAccount },
      store: metadataStore,
      password: "test-password",
    });

    expect(result).toEqual({ walletMetadata, created: false });
    expect(createWalletAccount).not.toHaveBeenCalled();
  });
});
