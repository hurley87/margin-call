import { convexDeprecatedResponse } from "@/lib/http/convex-deprecated-response";

/** @deprecated Use Convex `api.agentActivityLog.listForDesk` (reactive subscription). */
export function GET() {
  return convexDeprecatedResponse(
    "Deprecated: use Convex api.agentActivityLog.listForDesk from the client."
  );
}
