"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/** Dev-only widget: shows Convex auth identity subject when signed in. */
export function ConvexIdentityDebug() {
  const identity = useQuery(api.me.me);

  if (!identity) return null;

  return (
    <div className="fixed bottom-2 right-2 z-50 rounded border border-green-500/30 bg-black/80 px-3 py-1.5 font-mono text-xs text-green-400">
      convex: {identity.subject}
    </div>
  );
}
