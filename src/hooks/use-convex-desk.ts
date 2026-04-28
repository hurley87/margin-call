"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

/** Fetch the current user's deskManager row from Convex, or null. */
export function useConvexDeskManager() {
  return useQuery(api.deskManagers.getMe);
}

/** Upsert the current user's deskManager row. */
export function useUpsertDeskManager() {
  return useMutation(api.deskManagers.upsertMe);
}
