"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DIALOG_BACKDROP_CLASS,
  dialogPopupClass,
  cn,
  formatShortAddress,
  relativeTime,
} from "@/lib/utils";
import { AgentDeskBadge } from "./agent-desk-badge";
import {
  Check,
  Clipboard,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";

type MyDesk = {
  keyId: Id<"mcpApiKeys">;
  deskManagerId: Id<"deskManagers">;
  deskSubject?: string;
  walletAddress?: string;
  cdpAccountName?: string;
  createdAt: number;
  lastUsedAt?: number;
  withdraw: {
    ceremonyCompleted: boolean;
    allowlistCount: number;
    pendingProposal?: string;
    dailyCap?: number;
    dailyUsed?: number;
  };
};

type McpRequestRow = {
  _id: string;
  tool: string;
  idempotencyKey?: string;
  result?: unknown;
  error?: string;
  txHash?: string;
  durationMs: number;
  createdAt: number;
};

export function McpOperatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const myDesks = (useQuery(api.mcpApiKeys.listMyIssuedMcpDesks, {
    limit: 20,
  }) ?? []) as MyDesk[];

  const [selectedDeskId, setSelectedDeskId] =
    useState<Id<"deskManagers"> | null>(null);
  const [confirmAddress, setConfirmAddress] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [requests, setRequests] = useState<McpRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Rotation / revocation UI state.
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [keyOpError, setKeyOpError] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const confirmCeremony = useMutation(api.mcpApiKeys.confirmMyWithdrawCeremony);
  const listRequests = useQuery; // we call manually via refetch pattern, but use the query fn? For simplicity use direct in effect no, use lazy via button

  // Manual fetch for requests (avoids too many queries)
  const fetchRequests = async (deskId: Id<"deskManagers">) => {
    setLoadingRequests(true);
    try {
      // Convex http client not directly, but since we are in app we can use the generated but for demo use a trick:
      // Actually in practice the query hook is for reactive; for one-shot we can use the internal but better expose.
      // For this impl we call the public query via a small wrapper - to keep simple, re-use the hook by selecting.
      // Instead: store selected and use a second useQuery keyed by selected.
      // For the component we do reactive below.
    } finally {
      setLoadingRequests(false);
    }
  };

  // Reactive requests for the selected desk (clean, uses the secured query)
  const recentRequests = (useQuery(
    api.mcpApiKeys.listRecentMcpRequestsForMyDesk,
    selectedDeskId ? { deskManagerId: selectedDeskId, limit: 30 } : "skip"
  ) ?? []) as McpRequestRow[];

  const selectedDesk = myDesks.find((d) => d.deskManagerId === selectedDeskId);

  const handleConfirm = async () => {
    if (!selectedDeskId || !confirmAddress.trim()) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const res = await confirmCeremony({
        deskManagerId: selectedDeskId,
        address: confirmAddress.trim(),
      });
      if (res?.ok) {
        setConfirmAddress("");
        // success toast would go here; for now the list will refresh via reactivity
      } else {
        setConfirmError("Confirmation failed");
      }
    } catch (e: any) {
      setConfirmError(e?.message ?? "Failed to confirm ceremony");
    } finally {
      setIsConfirming(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  // Reset any previously-displayed new key when the user switches desks.
  React.useEffect(() => {
    setRotatedKey(null);
    setKeyOpError(null);
  }, [selectedDeskId]);

  const handleRotate = async (keyId: Id<"mcpApiKeys">) => {
    const confirmed = window.confirm(
      "Rotate this MCP key?\n\nThe old key stops working IMMEDIATELY. Update your MCP client (Claude Code / Cursor) with the new key before continuing.\n\nThe new key is shown ONCE and never again."
    );
    if (!confirmed) return;
    setIsRotating(true);
    setKeyOpError(null);
    setRotatedKey(null);
    try {
      const res = await fetch(`/api/mcp/keys/${keyId}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        key?: string;
        error?: string;
      };
      if (!res.ok || !data.key) {
        throw new Error(data.error ?? `Rotate failed (${res.status})`);
      }
      setRotatedKey(data.key);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Rotation failed";
      setKeyOpError(msg);
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevoke = async (keyId: Id<"mcpApiKeys">) => {
    const confirmed = window.confirm(
      "Revoke this MCP key?\n\nThe key stops working IMMEDIATELY. This is permanent — to keep using this desk you must rotate (or issue a fresh key)."
    );
    if (!confirmed) return;
    setIsRevoking(true);
    setKeyOpError(null);
    try {
      const res = await fetch(`/api/mcp/keys/${keyId}`, { method: "DELETE" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Revoke failed (${res.status})`);
      }
      // Reactive listIssuedBy will drop this row from `myDesks` automatically.
      setSelectedDeskId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Revocation failed";
      setKeyOpError(msg);
    } finally {
      setIsRevoking(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={DIALOG_BACKDROP_CLASS}
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          dialogPopupClass,
          "w-full max-w-3xl border-[var(--t-amber)]/30 bg-[var(--t-bg)]/95 p-0 text-[var(--t-text)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--t-border)]/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[var(--t-green)]" />
            <div className="font-mono text-sm font-semibold tracking-[0.08em] text-[var(--t-amber)]">
              MCP OPERATOR CONSOLE
            </div>
            <div className="rounded bg-[var(--t-amber)]/10 px-1.5 py-px text-[10px] text-[var(--t-amber)]">
              PHASE 6
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-[var(--t-text)]/60 hover:text-[var(--t-text)] hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 text-sm">
          {/* Intro */}
          <div className="text-[var(--t-text)]/70">
            Manage your AI agent desks (MCP/ Claude Code controlled). View audit
            logs, confirm the one-time withdrawal address ceremony (human
            binding), and inspect cash-out readiness. All writes are idempotent
            and fully audited in{" "}
            <code className="font-mono text-[10px]">mcpRequests</code>.
          </div>

          {/* My Desks */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--t-text)]/60">
              <ShieldCheck className="h-3.5 w-3.5" /> MY ISSUED AGENT DESKS
            </div>

            {myDesks.length === 0 && (
              <div className="rounded border border-[var(--t-border)]/40 bg-black/20 p-4 text-[var(--t-text)]/60">
                No MCP desks issued yet. Use <code>POST /api/mcp/keys</code> (or
                the script) while logged in to provision one. The resulting key
                powers a dedicated AGENT DESK with its own CDP wallet.
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {myDesks.map((d) => {
                const isSel = d.deskManagerId === selectedDeskId;
                const ready =
                  d.withdraw.ceremonyCompleted && d.withdraw.allowlistCount > 0;
                return (
                  <button
                    key={d.deskManagerId}
                    onClick={() => {
                      setSelectedDeskId(d.deskManagerId);
                      setConfirmAddress(d.withdraw.pendingProposal ?? "");
                    }}
                    className={cn(
                      "text-left rounded border p-3 transition",
                      isSel
                        ? "border-[var(--t-green)] bg-[var(--t-green)]/5"
                        : "border-[var(--t-border)]/40 hover:border-[var(--t-amber)]/40 hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <AgentDeskBadge compact />
                      <div className="font-mono text-[10px] text-[var(--t-text)]/50">
                        {relativeTime(d.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1.5 font-mono text-xs text-[var(--t-text)]">
                      {d.walletAddress
                        ? formatShortAddress(d.walletAddress)
                        : "no wallet"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span
                        className={cn(
                          "rounded px-1.5 py-px",
                          d.withdraw.ceremonyCompleted
                            ? "bg-[var(--t-green)]/15 text-[var(--t-green)]"
                            : "bg-[var(--t-amber)]/15 text-[var(--t-amber)]"
                        )}
                      >
                        {d.withdraw.ceremonyCompleted
                          ? "CEREMONY DONE"
                          : "CEREMONY NEEDED"}
                      </span>
                      <span className="rounded bg-white/5 px-1.5 py-px">
                        {d.withdraw.allowlistCount} allowlisted
                      </span>
                      {d.withdraw.pendingProposal && (
                        <span className="rounded bg-[var(--t-red)]/15 px-1.5 py-px text-[var(--t-red)]">
                          PENDING CONFIRM
                        </span>
                      )}
                      {ready && (
                        <span className="rounded bg-[var(--t-green)]/15 px-1.5 py-px text-[var(--t-green)]">
                          WITHDRAW READY
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Desk Detail + Ceremony */}
          {selectedDesk && (
            <div className="rounded border border-[var(--t-border)]/40 bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-[var(--t-text)]/60">
                <div>
                  SELECTED DESK •{" "}
                  {formatShortAddress(selectedDesk.walletAddress || "")}
                </div>
                <div className="font-mono text-[var(--t-green)]">
                  {selectedDesk.cdpAccountName}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <div className="text-[10px] text-[var(--t-text)]/50">
                    WITHDRAW STATUS
                  </div>
                  <div className="mt-1 font-semibold">
                    {selectedDesk.withdraw.ceremonyCompleted ? (
                      <span className="text-[var(--t-green)]">
                        Ceremony complete — withdrawals enabled
                      </span>
                    ) : (
                      <span className="text-[var(--t-amber)]">
                        Ceremony required before any cash-out
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs">
                    Allowlist: <b>{selectedDesk.withdraw.allowlistCount}</b>{" "}
                    address(es)
                    <br />
                    Daily cap:{" "}
                    <b>
                      {(selectedDesk.withdraw.dailyCap ?? 1000).toFixed(0)}
                    </b>{" "}
                    USDC (used today ~
                    {(selectedDesk.withdraw.dailyUsed ?? 0).toFixed(2)})
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[var(--t-text)]/50 mb-1">
                    CEREMONY ACTION
                  </div>
                  {!selectedDesk.withdraw.ceremonyCompleted ? (
                    <>
                      <div className="text-xs text-[var(--t-text)]/70 mb-2">
                        Enter (or paste from Claude) the exact address the agent
                        proposed. Confirming binds{" "}
                        <span className="font-mono">you</span> as the human
                        operator for this agent desk and activates{" "}
                        <code>withdraw_to_address</code>.
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={confirmAddress}
                          onChange={(e) => setConfirmAddress(e.target.value)}
                          placeholder="0x..."
                          className="flex-1 rounded border border-[var(--t-border)]/50 bg-black/40 px-2 py-1.5 font-mono text-xs placeholder:text-[var(--t-text)]/40 focus:outline-none focus:border-[var(--t-amber)]"
                        />
                        <button
                          onClick={handleConfirm}
                          disabled={isConfirming || !confirmAddress.trim()}
                          className="flex items-center gap-1.5 rounded bg-[var(--t-green)]/90 px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
                        >
                          {isConfirming ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          CONFIRM
                        </button>
                      </div>
                      {confirmError && (
                        <div className="mt-1 text-xs text-[var(--t-red)]">
                          {confirmError}
                        </div>
                      )}
                      {selectedDesk.withdraw.pendingProposal && (
                        <div className="mt-1 text-[10px] text-[var(--t-amber)]">
                          Claude proposed:{" "}
                          <code>{selectedDesk.withdraw.pendingProposal}</code>
                          <button
                            onClick={() =>
                              setConfirmAddress(
                                selectedDesk.withdraw.pendingProposal!
                              )
                            }
                            className="ml-1 underline"
                          >
                            use
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 rounded bg-[var(--t-green)]/10 p-2 text-xs text-[var(--t-green)]">
                      <ShieldCheck className="h-4 w-4" /> Human binding
                      complete. Agent may now register additional addresses and
                      withdraw.
                    </div>
                  )}
                </div>
              </div>

              {/* Key actions: rotate / revoke */}
              <div className="mt-5 rounded border border-[var(--t-border)]/40 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--t-text)]/60">
                  <ShieldCheck className="h-3.5 w-3.5" /> KEY ACTIONS
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleRotate(selectedDesk.keyId)}
                    disabled={isRotating || isRevoking}
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/10 px-3 py-1 text-xs font-semibold text-[var(--t-amber)] hover:bg-[var(--t-amber)]/20 disabled:opacity-50"
                    title="Issue a new key bound to this same desk; the old key is revoked immediately."
                  >
                    {isRotating ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    ROTATE KEY
                  </button>
                  <button
                    onClick={() => handleRevoke(selectedDesk.keyId)}
                    disabled={isRotating || isRevoking}
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--t-red)]/50 bg-[var(--t-red)]/10 px-3 py-1 text-xs font-semibold text-[var(--t-red)] hover:bg-[var(--t-red)]/20 disabled:opacity-50"
                    title="Permanently disable this key. Desk remains; traders/deals continue under any other unrevoked key for this desk."
                  >
                    {isRevoking ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    REVOKE KEY
                  </button>
                  <div className="ml-auto font-mono text-[10px] text-[var(--t-text)]/50">
                    keyId {String(selectedDesk.keyId).slice(0, 8)}…
                  </div>
                </div>
                {keyOpError && (
                  <div className="mt-2 text-[10px] text-[var(--t-red)]">
                    {keyOpError}
                  </div>
                )}
                {rotatedKey && (
                  <div className="mt-3 rounded border border-[var(--t-green)]/50 bg-[var(--t-green)]/5 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--t-green)]">
                      NEW KEY — SHOWN ONCE
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-black/40 p-2 font-mono text-[11px] text-[var(--t-text)]">
                        {rotatedKey}
                      </code>
                      <button
                        onClick={() => copy(rotatedKey)}
                        className="inline-flex items-center gap-1 rounded bg-[var(--t-green)]/90 px-2 py-1 text-[10px] font-semibold text-black"
                      >
                        <Clipboard className="h-3 w-3" /> COPY
                      </button>
                    </div>
                    <div className="mt-2 text-[10px] text-[var(--t-text)]/60">
                      Paste this into <code>MARGIN_CALL_MCP_KEY</code> in your
                      MCP client config (Claude Code / Cursor). The old key has
                      already been revoked.
                    </div>
                  </div>
                )}
              </div>

              {/* Recent mcpRequests debug table */}
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--t-text)]/60">
                  <div>RECENT MCP AUDIT (mcpRequests)</div>
                  <div className="font-mono text-[var(--t-text)]/40">
                    last 30
                  </div>
                </div>
                <div className="max-h-56 overflow-auto rounded border border-[var(--t-border)]/30 bg-black/40 text-xs font-mono">
                  {recentRequests.length === 0 && (
                    <div className="p-3 text-[var(--t-text)]/50">
                      No requests yet for this desk. Activity from Claude / MCP
                      server will appear here.
                    </div>
                  )}
                  {recentRequests.length > 0 && (
                    <table className="w-full table-fixed">
                      <thead className="bg-white/5 text-[10px] text-left text-[var(--t-text)]/60">
                        <tr>
                          <th className="p-2 w-24">TIME</th>
                          <th className="p-2 w-40">TOOL</th>
                          <th className="p-2">RESULT / ERROR</th>
                          <th className="p-2 w-28">TX</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {recentRequests.map((r) => (
                          <tr key={r._id} className="align-top">
                            <td className="p-2 text-[var(--t-text)]/60 whitespace-nowrap">
                              {relativeTime(r.createdAt)}
                            </td>
                            <td className="p-2 text-[var(--t-amber)]">
                              {r.tool}
                            </td>
                            <td className="p-2 break-all text-[10px]">
                              {r.error ? (
                                <span className="text-[var(--t-red)]">
                                  {r.error}
                                </span>
                              ) : (
                                <span className="text-[var(--t-green)]/80">
                                  {typeof r.result === "object"
                                    ? JSON.stringify(r.result).slice(0, 120)
                                    : String(r.result ?? "ok")}
                                </span>
                              )}
                              {r.idempotencyKey && (
                                <div className="text-[8px] text-[var(--t-text)]/40 mt-0.5">
                                  key: {r.idempotencyKey.slice(0, 12)}…
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              {r.txHash ? (
                                <button
                                  onClick={() => copy(r.txHash!)}
                                  className="inline-flex items-center gap-1 text-[var(--t-green)] hover:underline"
                                  title={r.txHash}
                                >
                                  {r.txHash.slice(0, 10)}…{" "}
                                  <Clipboard className="h-3 w-3" />
                                </button>
                              ) : (
                                <span className="text-[var(--t-text)]/30">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-[var(--t-text)]/40">
                  Writes are always logged with idempotency semantics. Reads are
                  compact.
                </div>
              </div>
            </div>
          )}

          {!selectedDesk && myDesks.length > 0 && (
            <div className="text-xs text-[var(--t-text)]/50">
              Select a desk above to manage ceremony or inspect its audit trail.
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--t-border)]/50 px-5 py-3 text-xs">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded px-3 py-1 hover:bg-white/5"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
