import { convexDeprecatedResponse } from "@/lib/http/convex-deprecated-response";

const DEPRECATED_MESSAGE =
  "Deprecated: this HTTP route has been replaced by Convex functions and subscriptions.";

export function GET() {
  return convexDeprecatedResponse(DEPRECATED_MESSAGE);
}
