import {
  encodeAbiParameters,
  encodeEventTopics,
  toEventSignature,
  toFunctionSignature,
  type Address,
  type TransactionReceipt,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  assetRegistryAbi,
  erc20Abi,
  getPackMintedTokenId,
  packCustodyAbi,
  ripEngineAbi,
} from "./abis";

const functionSignatures = (abi: readonly unknown[]) =>
  abi
    .filter(
      (item): item is Extract<(typeof abi)[number], { type: "function" }> =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "function"
    )
    .map(toFunctionSignature);

const eventSignatures = (abi: readonly unknown[]) =>
  abi
    .filter(
      (item): item is Extract<(typeof abi)[number], { type: "event" }> =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "event"
    )
    .map(toEventSignature);

describe("Maker lifecycle ABIs", () => {
  it("exposes ERC-20 funding calls", () => {
    expect(functionSignatures(erc20Abi)).toEqual([
      "balanceOf(address)",
      "allowance(address,address)",
      "approve(address,uint256)",
    ]);
  });

  it("exposes PackCustody lifecycle calls and receipt events", () => {
    expect(functionSignatures(packCustodyAbi)).toEqual(
      expect.arrayContaining([
        "mint(address[],uint256[])",
        "topUp(uint256,address[],uint256[])",
        "delistAndRedeem(uint256)",
        "basketOf(uint256)",
        "creatorOf(uint256)",
        "isListed(uint256)",
        "whitelistedAssets()",
      ])
    );
    expect(eventSignatures(packCustodyAbi)).toEqual(
      expect.arrayContaining([
        "PackMinted(uint256,address,address[],uint256[])",
        "PackToppedUp(uint256,address,address[],uint256[])",
        "PackUnlisted(uint256)",
        "PackRedeemed(uint256,address,address[],uint256[])",
      ])
    );
  });

  it("exposes RipEngine Maker lifecycle calls", () => {
    expect(functionSignatures(ripEngineAbi)).toEqual(
      expect.arrayContaining([
        "enterPool(uint256)",
        "exitPool(uint256)",
        "isResting(uint256)",
        "syncPackNav(uint256)",
        "pendingOf(uint256)",
        "claimableFees(address)",
        "claim(uint256[])",
      ])
    );
  });

  it("exposes AssetRegistry quote and Pack band reads", () => {
    expect(functionSignatures(assetRegistryAbi)).toEqual(
      expect.arrayContaining([
        "quote(address,uint256)",
        "minPackNav()",
        "poolMax()",
      ])
    );
  });
});

describe("getPackMintedTokenId", () => {
  const custody = "0x0000000000000000000000000000000000000001" as Address;
  const creator = "0x0000000000000000000000000000000000000002" as Address;
  const asset = "0x0000000000000000000000000000000000000003" as Address;

  const packMintedLog = (address: Address, tokenId: bigint) => ({
    address,
    blockHash: null,
    blockNumber: null,
    data: encodeAbiParameters(
      [{ type: "address[]" }, { type: "uint256[]" }],
      [[asset], [10n]]
    ),
    logIndex: null,
    removed: false,
    topics: encodeEventTopics({
      abi: packCustodyAbi,
      eventName: "PackMinted",
      args: { tokenId, creator },
    }),
    transactionHash: null,
    transactionIndex: null,
  });

  it("decodes the token id from the expected custody contract", () => {
    const receipt = {
      logs: [
        packMintedLog("0x0000000000000000000000000000000000000004", 99n),
        packMintedLog(custody, 42n),
      ],
    } as Pick<TransactionReceipt, "logs">;

    expect(getPackMintedTokenId(receipt, custody)).toBe(42n);
  });

  it("rejects missing or ambiguous PackMinted events", () => {
    expect(() => getPackMintedTokenId({ logs: [] }, custody)).toThrow(
      "Expected one PackMinted event, received 0"
    );

    const receipt = {
      logs: [packMintedLog(custody, 1n), packMintedLog(custody, 2n)],
    } as Pick<TransactionReceipt, "logs">;
    expect(() => getPackMintedTokenId(receipt, custody)).toThrow(
      "Expected one PackMinted event, received 2"
    );
  });
});
