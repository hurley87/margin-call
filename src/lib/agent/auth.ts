import { NextRequest } from "next/server";

/** Derive the app's base URL from env or the incoming request. */
export function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  );
}
