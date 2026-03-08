import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { makePublicClient } from "@/lib/contracts/client";
import { getAddress, encodeAbiParameters, concat, keccak256 } from "viem";
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
    const tokenId = body.tokenId;
    const txHash = body.txHash;

    if (!name || typeof name !== "string" || name.length > 50) {
      return NextResponse.json(
        { error: "Name is required (max 50 characters)" },
        { status: 400 }
      );
    }

    if (tokenId === undefined || typeof tokenId !== "number") {
      return NextResponse.json(
        { error: "tokenId is required" },
        { status: 400 }
      );
    }

    const publicClient = makePublicClient();

    // Verify on-chain ownership: caller must own the NFT
    const owner = await publicClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: identityRegistryAbi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });

    if (getAddress(owner as string) !== getAddress(walletAddress)) {
      return NextResponse.json(
        { error: "You do not own this token" },
        { status: 403 }
      );
    }

    // Derive ERC-6551 Token Bound Account address
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
          BigInt(tokenId),
        ],
      });
      tbaAddress = tba;
    } catch {
      // Fallback: compute ERC-6551 address deterministically using CREATE2
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
          BigInt(tokenId),
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
        token_id: tokenId,
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
