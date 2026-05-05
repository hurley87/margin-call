import { convexDeprecatedResponse } from "@/lib/http/convex-deprecated-response";

/** @deprecated Use Convex `api.dealApprovals.listPending` (reactive subscription). */
export function GET() {
  return convexDeprecatedResponse(
    "Deprecated: use Convex api.dealApprovals.listPending from the client."
  );
}
