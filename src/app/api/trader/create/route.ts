import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodePacked,
  keccak256,
  getAddress,
  concat,
  pad,
  toHex,
  toBytes,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  IDENTITY_REGISTRY_ADDRESS,
  ERC6551_REGISTRY_ADDRESS,
  ERC6551_DEFAULT_IMPLEMENTATION,
  CONTRACTS_CHAIN,
  CONTRACTS_CHAIN_ID,
  identityRegistryAbi,
  erc6551RegistryAbi,
} from "@/lib/contracts/escrow";

export async function POST(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);

    const walletAccount = user.linkedAccounts?.find((a) => a.type === "wallet");
    const walletAddress =
      user.wallet?.address ??
      (walletAccount && "address" in walletAccount
        ? (walletAccount as { address: string }).address
        : undefined);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const name = body.name?.trim();
    if (!name || typeof name !== "string" || name.length > 50) {
      return NextResponse.json(
        { error: "Name is required (max 50 characters)" },
        { status: 400 }
      );
    }

    const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
    if (!operatorKey) {
      return NextResponse.json(
        { error: "Server operator key not configured" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(operatorKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: CONTRACTS_CHAIN,
      transport: http(),
    });

    const walletClient = createWalletClient({
      account,
      chain: CONTRACTS_CHAIN,
      transport: http(),
    });

    // Mint ERC-8004 NFT to the desk manager's wallet
    // The Identity Registry's register function mints a new token to the specified address
    let tokenId: bigint;
    try {
      const hash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: identityRegistryAbi,
        functionName: "register",
        args: [getAddress(walletAddress)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Extract tokenId from Transfer event (ERC-721 standard)
      // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
      const transferEventSig = keccak256(
        toBytes("Transfer(address,address,uint256)")
      );
      const transferLog = receipt.logs.find(
        (log) => log.topics[0] === transferEventSig
      );

      if (transferLog && transferLog.topics[3]) {
        tokenId = BigInt(transferLog.topics[3]);
      } else {
        // Fallback: try to get tokenId from return value or use a counter
        // This handles cases where the event structure differs
        return NextResponse.json(
          { error: "Failed to extract token ID from mint transaction" },
          { status: 500 }
        );
      }
    } catch (mintError) {
      console.error("Mint error:", mintError);
      // If the register function doesn't exist, try mint(address)
      try {
        const mintAbi = [
          {
            type: "function",
            name: "mint",
            inputs: [{ name: "to", type: "address" }],
            outputs: [{ name: "tokenId", type: "uint256" }],
            stateMutability: "nonpayable",
          },
        ] as const;

        const hash = await walletClient.writeContract({
          address: IDENTITY_REGISTRY_ADDRESS,
          abi: mintAbi,
          functionName: "mint",
          args: [getAddress(walletAddress)],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        const transferEventSig = keccak256(
          toBytes("Transfer(address,address,uint256)")
        );
        const transferLog = receipt.logs.find(
          (log) => log.topics[0] === transferEventSig
        );

        if (transferLog && transferLog.topics[3]) {
          tokenId = BigInt(transferLog.topics[3]);
        } else {
          return NextResponse.json(
            { error: "Failed to extract token ID from mint transaction" },
            { status: 500 }
          );
        }
      } catch (mintError2) {
        console.error("Mint fallback error:", mintError2);
        return NextResponse.json(
          {
            error:
              "Failed to mint ERC-8004 NFT. The Identity Registry may require specific permissions.",
          },
          { status: 500 }
        );
      }
    }

    // Derive ERC-6551 Token Bound Account address deterministically
    // Uses the ERC-6551 registry's account() view function or computes locally
    let tbaAddress: string;
    try {
      const tba = await publicClient.readContract({
        address: ERC6551_REGISTRY_ADDRESS,
        abi: erc6551RegistryAbi,
        functionName: "account",
        args: [
          ERC6551_DEFAULT_IMPLEMENTATION,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          BigInt(CONTRACTS_CHAIN_ID),
          IDENTITY_REGISTRY_ADDRESS,
          tokenId,
        ],
      });
      tbaAddress = tba;
    } catch {
      // Fallback: compute ERC-6551 address deterministically using CREATE2
      // address = create2(registry, salt, keccak256(initCode))
      // where initCode encodes (implementation, chainId, tokenContract, tokenId, salt)
      const salt =
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      const encodedData = encodeAbiParameters(
        [
          { type: "uint256" },
          { type: "uint256" },
          { type: "address" },
          { type: "uint256" },
        ],
        [
          BigInt(CONTRACTS_CHAIN_ID),
          BigInt(0),
          IDENTITY_REGISTRY_ADDRESS,
          tokenId,
        ]
      );
      const creationCode = concat([
        "0x3d60ad80600a3d3981f3363d3d373d3d3d363d73",
        ERC6551_DEFAULT_IMPLEMENTATION,
        "0x5af43d82803e903d91602b57fd5bf3",
        encodedData,
      ]);
      const codeHash = keccak256(creationCode);
      const create2Input = concat([
        "0xff",
        ERC6551_REGISTRY_ADDRESS,
        salt,
        codeHash,
      ]);
      tbaAddress = getAddress(`0x${keccak256(create2Input).slice(26)}`);
    }

    // Store trader in Supabase
    const supabase = createServerClient();

    const { data: trader, error: dbError } = await supabase
      .from("traders")
      .insert({
        token_id: Number(tokenId),
        name,
        owner_address: walletAddress.toLowerCase(),
        tba_address: tbaAddress,
        status: "active",
        mandate: {},
      })
      .select()
      .single();

    if (dbError) {
      console.error("Supabase error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ trader });
  } catch (e) {
    console.error("Create trader error:", e);
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
