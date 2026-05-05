import { convexDeprecatedResponse } from "@/lib/http/convex-deprecated-response";

/** @deprecated Use Convex `api.dealApprovals.approve` / `api.dealApprovals.reject`. */
export function POST() {
  return convexDeprecatedResponse(
    "Deprecated: use Convex api.dealApprovals.approve or api.dealApprovals.reject."
  );
}
