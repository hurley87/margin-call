import { NextRequest, NextResponse } from "next/server";
import { createNonce } from "@/lib/siwa/verify";

/**
 * POST /api/siwa/nonce
 * Issues a SIWA nonce for agent authentication challenges.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, address } = body as {
      agent_id?: number;
      address?: string;
    };

    if (agent_id === undefined || typeof agent_id !== "number") {
      return NextResponse.json(
        { error: "agent_id is required (number)" },
        { status: 400 }
      );
    }

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    const result = await createNonce(agent_id, address);

    return NextResponse.json(result);
  } catch (e) {
    console.error("SIWA nonce error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
