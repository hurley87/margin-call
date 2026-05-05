import { convexDeprecatedResponse } from "@/lib/http/convex-deprecated-response";

/** @deprecated Use Convex `api.portfolio.forDesk` (reactive subscription). */
export function GET() {
  return convexDeprecatedResponse(
    "Deprecated: use Convex api.portfolio.forDesk from the client."
  );
}
