import { NextRequest, NextResponse } from "next/server";
import { withX402, x402ResourceServer, type RouteConfig } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { BASE_NETWORK, PLATFORM_WALLET_ADDRESS } from "@/lib/constants";

const facilitatorUrl =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  BASE_NETWORK,
  new ExactEvmScheme()
);

/**
 * Creates a RouteConfig for an x402-protected endpoint.
 *
 * @param price - Dollar amount as a string (e.g. "$5.00")
 * @param description - Human-readable description of the payment
 * @param payTo - Wallet address to receive payment (defaults to platform wallet)
 */
export function createRouteConfig(
  price: string,
  description: string,
  payTo: string = PLATFORM_WALLET_ADDRESS
): RouteConfig {
  return {
    accepts: {
      scheme: "exact",
      network: BASE_NETWORK,
      payTo,
      price,
    },
    description,
  };
}

/**
 * Wraps a Next.js route handler with x402 payment protection.
 * Payment is settled only after the handler returns a successful response.
 *
 * @param handler - The route handler to protect
 * @param price - Dollar amount required (e.g. "$5.00")
 * @param description - Human-readable description of what the payment is for
 * @param payTo - Wallet to receive payment (defaults to platform wallet)
 */
export function withPayment<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  price: string,
  description: string,
  payTo?: string
) {
  const routeConfig = createRouteConfig(price, description, payTo);
  return withX402(handler, routeConfig, resourceServer);
}

/**
 * Wraps a Next.js route handler with x402 payment protection using a
 * dynamic price extracted from the request body.
 *
 * The priceResolver receives the parsed request body and returns the
 * dollar amount string (e.g. "$50.00"). The request body is cloned
 * so the handler can still read it.
 *
 * @param handler - The route handler to protect
 * @param priceResolver - Function that extracts the price from the request body
 * @param description - Human-readable description of what the payment is for
 * @param payTo - Wallet to receive payment (defaults to platform wallet)
 */
export function withDynamicPayment<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  priceResolver: (body: Record<string, unknown>) => string,
  description: string,
  payTo?: string
) {
  return async (request: NextRequest): Promise<NextResponse<T>> => {
    // Clone request to read body without consuming it
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
    const routeConfig = createRouteConfig(price, description, payTo);
    const wrappedHandler = withX402(handler, routeConfig, resourceServer);
    return wrappedHandler(request);
  };
}
