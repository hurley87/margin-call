import type { Hex } from "viem";

export type JsonRpcFetch = typeof fetch;

const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export function getBaseRpcUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.BASE_RPC_URL?.trim()
      : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_RPC;
}

type JsonRpcSuccess<T> = { jsonrpc: "2.0"; id: number; result: T };
type JsonRpcError = {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string };
};

async function jsonRpc<T>(
  method: string,
  params: unknown[],
  fetchImpl: JsonRpcFetch = fetch,
  rpcUrl: string = getBaseRpcUrl()
): Promise<T> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`Base RPC HTTP ${response.status}`);
  }
  const body = (await response.json()) as JsonRpcSuccess<T> | JsonRpcError;
  if ("error" in body) {
    throw new Error(`Base RPC ${method}: ${body.error.message}`);
  }
  return body.result;
}

export type RpcReceiptLog = {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex | null;
  transactionHash: Hex | null;
  logIndex: Hex | null;
  removed?: boolean;
};

export type RpcTransactionReceipt = {
  status: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logs: RpcReceiptLog[];
} | null;

export type RpcLog = {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed?: boolean;
};

export function hexToNumber(hex: string): number {
  return Number(BigInt(hex));
}

export async function ethGetTransactionReceipt(
  txHash: string,
  fetchImpl?: JsonRpcFetch,
  rpcUrl?: string
): Promise<RpcTransactionReceipt> {
  return jsonRpc<RpcTransactionReceipt>(
    "eth_getTransactionReceipt",
    [txHash],
    fetchImpl,
    rpcUrl
  );
}

export async function ethBlockNumber(
  fetchImpl?: JsonRpcFetch,
  rpcUrl?: string
): Promise<number> {
  const hex = await jsonRpc<Hex>("eth_blockNumber", [], fetchImpl, rpcUrl);
  return hexToNumber(hex);
}

export async function ethGetLogs(
  args: {
    address: string;
    topics: readonly (string | readonly string[] | null)[];
    fromBlock: number;
    toBlock: number;
  },
  fetchImpl?: JsonRpcFetch,
  rpcUrl?: string
): Promise<RpcLog[]> {
  return jsonRpc<RpcLog[]>(
    "eth_getLogs",
    [
      {
        address: args.address,
        topics: args.topics,
        fromBlock: `0x${args.fromBlock.toString(16)}`,
        toBlock: `0x${args.toBlock.toString(16)}`,
      },
    ],
    fetchImpl,
    rpcUrl
  );
}

export async function ethGetBlockTimestamp(
  blockNumber: number,
  fetchImpl?: JsonRpcFetch,
  rpcUrl?: string
): Promise<number | undefined> {
  const block = await jsonRpc<{ timestamp: Hex } | null>(
    "eth_getBlockByNumber",
    [`0x${blockNumber.toString(16)}`, false],
    fetchImpl,
    rpcUrl
  );
  if (!block?.timestamp) return undefined;
  return hexToNumber(block.timestamp);
}
