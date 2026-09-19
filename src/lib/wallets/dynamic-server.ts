import { ADDRESS_RE } from "@margin-call/shared/address";
import { base } from "viem/chains";
import type {
  TransactionReceiptSummary,
  TypedDataAgentWallet,
  UnsignedTransaction,
  WalletTypedData,
} from "@/lib/wallets/adapter";
import type {
  DynamicWalletMetadata,
  WalletMetadataStore,
} from "@/lib/wallets/metadata-store";

export type CreateWalletAccountResult = {
  walletMetadata: DynamicWalletMetadata;
  externalServerKeyShares?: unknown;
};

export type DynamicServerWalletApi = {
  createWalletAccount: (params: {
    password: string;
    backUpToDynamic: true;
  }) => Promise<CreateWalletAccountResult>;
  signTransaction: (params: {
    walletMetadata: DynamicWalletMetadata;
    password: string;
    transaction: unknown;
  }) => Promise<string>;
  signTypedData: (params: {
    walletMetadata: DynamicWalletMetadata;
    password: string;
    typedData: unknown;
  }) => Promise<string>;
};

export type DynamicChainClient = {
  prepareTransactionRequest: (args: {
    account: `0x${string}`;
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
    chain: typeof base;
  }) => Promise<unknown>;
  sendRawTransaction: (args: {
    serializedTransaction: `0x${string}`;
  }) => Promise<`0x${string}`>;
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    transactionHash?: `0x${string}`;
    logs?: TransactionReceiptSummary["logs"];
  }>;
};

export type ProvisionedDynamicWallet = {
  walletMetadata: DynamicWalletMetadata;
  created: boolean;
};

function asAddress(accountAddress: string): `0x${string}` {
  if (!ADDRESS_RE.test(accountAddress)) {
    throw new Error("Dynamic wallet metadata is missing a Base address");
  }
  return accountAddress as `0x${string}`;
}

export function dynamicWalletAddress(
  walletMetadata: DynamicWalletMetadata
): `0x${string}` {
  return asAddress(walletMetadata.accountAddress);
}

/**
 * Start without an address: create a Dynamic server wallet, or reload the one
 * already provisioned. Signing material stays in Dynamic's backup service.
 */
export async function provisionOrResolveDynamicWallet(args: {
  client: Pick<DynamicServerWalletApi, "createWalletAccount">;
  store: WalletMetadataStore;
  password: string;
}): Promise<ProvisionedDynamicWallet> {
  const existing = await args.store.load();
  if (existing) {
    return { walletMetadata: existing, created: false };
  }

  const { walletMetadata } = await args.client.createWalletAccount({
    password: args.password,
    backUpToDynamic: true,
  });
  asAddress(walletMetadata.accountAddress);
  await args.store.save(walletMetadata);
  return { walletMetadata, created: true };
}

function asSignedHex(value: string, what: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`Dynamic did not return a ${what}`);
  }
  return value as `0x${string}`;
}

/**
 * Dynamic reference wallet: Base transactions plus EIP-712 typed-data
 * signing for the Uniswap Permit2 acquisition path.
 *
 * Key shares are recovered inside Dynamic from the password-protected backup;
 * this adapter never accepts or stores them.
 */
export function createDynamicAgentWallet(args: {
  client: Pick<DynamicServerWalletApi, "signTransaction" | "signTypedData">;
  publicClient: DynamicChainClient;
  walletMetadata: DynamicWalletMetadata;
  password: string;
}): TypedDataAgentWallet {
  const address = dynamicWalletAddress(args.walletMetadata);

  return {
    address,
    async sendTransaction(tx: UnsignedTransaction) {
      if (tx.value !== undefined && tx.value < 0n) {
        throw new Error("Transaction value cannot be negative");
      }
      const prepared = await args.publicClient.prepareTransactionRequest({
        account: address,
        to: tx.to,
        ...(tx.data ? { data: tx.data } : {}),
        ...(tx.value !== undefined ? { value: tx.value } : {}),
        chain: base,
      });
      const signed = asSignedHex(
        await args.client.signTransaction({
          walletMetadata: args.walletMetadata,
          password: args.password,
          transaction: prepared,
        }),
        "signed transaction"
      );
      return args.publicClient.sendRawTransaction({
        serializedTransaction: signed,
      });
    },
    async waitForReceipt(hash): Promise<TransactionReceiptSummary> {
      const receipt = await args.publicClient.waitForTransactionReceipt({
        hash,
      });
      return {
        hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        ...(receipt.logs ? { logs: receipt.logs } : {}),
      };
    },
    async signTypedData(typedData: WalletTypedData) {
      return asSignedHex(
        await args.client.signTypedData({
          walletMetadata: args.walletMetadata,
          password: args.password,
          typedData,
        }),
        "typed-data signature"
      );
    },
  };
}
