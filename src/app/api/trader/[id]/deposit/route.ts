import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.amount_usdc !== "number" || body.amount_usdc <= 0) {
    return NextResponse.json(
      { error: "amount_usdc must be a positive number" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error: "Not implemented",
      message:
        "Server-side deposits require CDP AgentKit or a paymaster. " +
        "Use the client-side UI to deposit via your connected wallet.",
      trader_id: id,
      amount_usdc: body.amount_usdc,
    },
    { status: 501 }
  );
}
