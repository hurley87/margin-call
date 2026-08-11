import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { fetchCrashAttestation } from "@/lib/inco-attestation";

export const runtime = "nodejs";

type AttestationRequest = {
  crashRandom?: string;
};

/**
 * Server-side Inco attestation for the verify-and-settle path.
 * Keeps `@inco/lightning-js` off the client bundle.
 */
export async function POST(request: Request) {
  let body: AttestationRequest;
  try {
    body = (await request.json()) as AttestationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const crashRandom = body.crashRandom;
  if (!crashRandom || !isHex(crashRandom) || crashRandom.length !== 66) {
    return NextResponse.json(
      { error: "crashRandom must be a 32-byte hex handle" },
      { status: 400 }
    );
  }

  try {
    const attestation = await fetchCrashAttestation(crashRandom as Hex, {
      // Shorter retry budget for interactive UI; the hook can retry the POST.
      attempts: 6,
      delayMs: 5_000,
    });
    return NextResponse.json({
      plaintext: attestation.plaintext.toString(),
      signatures: attestation.signatures,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Attestation request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
