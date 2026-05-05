import { NextResponse } from "next/server";

/** HTTP 410 with a stable JSON body for legacy routes superseded by Convex. */
export function convexDeprecatedResponse(error: string) {
  return NextResponse.json({ error }, { status: 410 });
}
