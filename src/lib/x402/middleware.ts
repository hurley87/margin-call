import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_WALLET_ADDRESS, USDC_ADDRESS } from "@/lib/constants";

/** x402 network name for Base mainnet */
const BASE_NETWORK = "base";

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://facilitator.corbits.dev";

interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name: string; version: string };
}

function buildPaymentRequirements(
  price: string,
  resource: string,
  description: string,
  payTo: string
): PaymentRequirements {
  // Convert dollar string like "$5.00" to USDC atomic units (6 decimals)
  const dollars = parseFloat(price.replace("$", ""));
  const atomicAmount = BigInt(Math.round(dollars * 1_000_000)).toString();

  return {
    scheme: "exact",
    network: BASE_NETWORK,
    maxAmountRequired: atomicAmount,
    resource,
    description,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_ADDRESS,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };
}

function decodePaymentHeader(header: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return JSON.parse(header);
  }
}

async function verifyPayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<{ isValid: boolean; invalidReason?: string }> {
  const payload = decodePaymentHeader(paymentHeader);
  const res = await fetch(`${FACILITATOR_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      isValid: false,
      invalidReason: `Facilitator error: ${res.status} ${text}`,
    };
  }
  return res.json();
}

async function settlePayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<void> {
  const payload = decodePaymentHeader(paymentHeader);
  await fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
  });
}

/**
 * Wraps a Next.js route handler with x402 payment protection.
 */
export function withPayment<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  price: string,
  description: string,
  payTo: string = PLATFORM_WALLET_ADDRESS
) {
  return async (request: NextRequest): Promise<NextResponse<T>> => {
    const resource = request.nextUrl.toString();
    const requirements = buildPaymentRequirements(
      price,
      resource,
      description,
      payTo
    );

    const paymentHeader =
      request.headers.get("x-payment") ??
      request.headers.get("payment-signature");

    // No payment header → return 402 with requirements
    if (!paymentHeader) {
      return NextResponse.json(
        { x402Version: 1, accepts: [requirements] },
        { status: 402 }
      ) as NextResponse<T>;
    }

    // Verify the payment with the facilitator
    const verification = await verifyPayment(paymentHeader, requirements);
    if (!verification.isValid) {
      return NextResponse.json(
        { error: `Payment invalid: ${verification.invalidReason}` },
        { status: 402 }
      ) as NextResponse<T>;
    }

    // Run the actual handler
    const response = await handler(request);

    // Only settle if handler succeeded
    if (response.ok) {
      try {
        await settlePayment(paymentHeader, requirements);
      } catch (e) {
        console.error("x402 settlement failed:", e);
      }
    }

    return response;
  };
}

/**
 * Wraps a Next.js route handler with x402 payment protection using a
 * dynamic price extracted from the request body.
 */
export function withDynamicPayment<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  priceResolver: (body: Record<string, unknown>) => string,
  description: string,
  payTo?: string
) {
  return async (request: NextRequest): Promise<NextResponse<T>> => {
    const clonedRequest = request.clone();
    let body: Record<string, unknown>;
    try {
      body = await clonedRequest.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ) as NextResponse<T>;
    }

    const price = priceResolver(body);
    const wrappedHandler = withPayment(handler, price, description, payTo);
    return wrappedHandler(request);
  };
}
