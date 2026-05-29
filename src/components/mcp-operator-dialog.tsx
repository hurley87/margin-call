"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DIALOG_BACKDROP_CLASS,
  dialogPopupClass,
  cn,
  formatShortAddress,
  relativeTime,
} from "@/lib/utils";
import { authFetch } from "@/lib/api";
import { AgentDeskBadge } from "./agent-desk-badge";
import {
  Clipboard,
  Plus,
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

function OneTimeKeyReveal({
  keyValue,
  onCopy,
  footer,
}: {
  keyValue: string;
  onCopy: (text: string) => void;
  footer: React.ReactNode;
}) {
  return (
    <div className="rounded border border-[var(--t-green)]/50 bg-[var(--t-green)]/5 p-3">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--t-green)]">
        NEW KEY — SHOWN ONCE
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-black/40 p-2 font-mono text-[11px] text-[var(--t-text)]">
          {keyValue}
        </code>
        <button
          onClick={() => onCopy(keyValue)}
          className="inline-flex items-center gap-1 rounded bg-[var(--t-green)]/90 px-2 py-1 text-[10px] font-semibold text-black"
        >
          <Clipboard className="h-3 w-3" /> COPY
        </button>
      </div>
      <div className="mt-2 text-[10px] text-[var(--t-text)]/60">{footer}</div>
    </div>
  );
}

const ISSUED_KEY_FOOTER = (
  <>
    Copy this key into <code className="font-mono">MARGIN_CALL_MCP_KEY</code> in
    your MCP client config. Then connect Base MCP and tell your assistant to run{" "}
    <code className="font-mono">set_desk_wallet</code> with your wallet address.
  </>
);

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

  const [keyOp, setKeyOp] = useState<"rotating" | "revoking" | null>(null);
  const [keyOpError, setKeyOpError] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const recentRequests = (useQuery(
    api.mcpApiKeys.listRecentMcpRequestsForMyDesk,
    selectedDeskId ? { deskManagerId: selectedDeskId, limit: 30 } : "skip"
  ) ?? []) as McpRequestRow[];

  const selectedDesk = myDesks.find((d) => d.deskManagerId === selectedDeskId);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  React.useEffect(() => {
    setRotatedKey(null);
    setKeyOpError(null);
  }, [selectedDeskId]);

  const runKeyOp = async (
    op: "rotating" | "revoking",
    confirmMsg: string,
    doFetch: () => Promise<Response>,
    onSuccess: (data: Record<string, unknown>) => void
  ) => {
    if (!window.confirm(confirmMsg)) return;
    setKeyOp(op);
    setKeyOpError(null);
    try {
      const res = await doFetch();
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok)
        throw new Error(
          (data.error as string) ?? `${op} failed (${res.status})`
        );
      onSuccess(data);
    } catch (e: unknown) {
      setKeyOpError(e instanceof Error ? e.message : `${op} failed`);
    } finally {
      setKeyOp(null);
    }
  };

  const handleRotate = (keyId: Id<"mcpApiKeys">) =>
    runKeyOp(
      "rotating",
      "Rotate this MCP key?\n\nThe old key stops working IMMEDIATELY. Update your MCP client (Claude Code / Cursor) with the new key before continuing.\n\nThe new key is shown ONCE and never again.",
      () =>
        fetch(`/api/mcp/keys/${keyId}/rotate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      (data) => {
        if (!data.key) throw new Error("No key returned");
        setRotatedKey(data.key as string);
      }
    );

  const handleRevoke = (keyId: Id<"mcpApiKeys">) =>
    runKeyOp(
      "revoking",
      "Revoke this MCP key?\n\nThe key stops working IMMEDIATELY. This is permanent — to keep using this desk you must rotate (or issue a fresh key).",
      () => fetch(`/api/mcp/keys/${keyId}`, { method: "DELETE" }),
      // Reactive listIssuedBy will drop this row from `myDesks` automatically.
      () => setSelectedDeskId(null)
    );

  const handleIssue = async () => {
    setIssuing(true);
    setIssueError(null);
    setIssuedKey(null);
    try {
      const res = await authFetch("/api/mcp/keys", { method: "POST" });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(
          (data.error as string) ?? `Failed to issue key (${res.status})`
        );
      }
      if (!data.key) throw new Error("No key returned");
      setIssuedKey(data.key as string);
    } catch (e: unknown) {
      setIssueError(e instanceof Error ? e.message : "Failed to issue key");
    } finally {
      setIssuing(false);
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
            Manage your AI agent desks (MCP / Claude Code controlled). Rotate or
            revoke keys, and inspect the recent audit trail. All writes are
            idempotent and fully audited in{" "}
            <code className="font-mono text-[10px]">mcpRequests</code>.
          </div>

          {/* My Desks */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--t-text)]/60">
                <ShieldCheck className="h-3.5 w-3.5" /> MY ISSUED AGENT DESKS
              </div>
              {myDesks.length > 0 && (
                <button
                  onClick={handleIssue}
                  disabled={issuing}
                  className="inline-flex items-center gap-1 rounded border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--t-amber)] hover:bg-[var(--t-amber)]/20 disabled:opacity-50"
                >
                  {issuing ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  NEW DESK KEY
                </button>
              )}
            </div>

            {myDesks.length === 0 && (
              <div className="rounded border border-[var(--t-border)]/40 bg-black/20 p-4 space-y-4">
                <p className="text-[var(--t-text)]/70">
                  Connect an AI assistant (Claude Code or Cursor) to trade on
                  your behalf. Each Agent Desk gets its own wallet and API key.
                </p>
                <button
                  onClick={handleIssue}
                  disabled={issuing}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/10 px-4 py-2 text-xs font-semibold text-[var(--t-amber)] hover:bg-[var(--t-amber)]/20 disabled:opacity-50"
                >
                  {issuing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  ISSUE AGENT DESK KEY
                </button>
              </div>
            )}

            {issueError && (
              <div className="mt-2 text-[10px] text-[var(--t-red)]">
                {issueError}
              </div>
            )}
            {issuedKey && (
              <div className="mt-3">
                <OneTimeKeyReveal
                  keyValue={issuedKey}
                  onCopy={copy}
                  footer={ISSUED_KEY_FOOTER}
                />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {myDesks.map((d) => {
                const isSel = d.deskManagerId === selectedDeskId;
                return (
                  <button
                    key={d.deskManagerId}
                    onClick={() => setSelectedDeskId(d.deskManagerId)}
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
                    {d.lastUsedAt && (
                      <div className="mt-2 font-mono text-[10px] text-[var(--t-text)]/50">
                        last used {relativeTime(d.lastUsedAt)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Desk Detail */}
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

              {/* Key actions: rotate / revoke */}
              <div className="rounded border border-[var(--t-border)]/40 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--t-text)]/60">
                  <ShieldCheck className="h-3.5 w-3.5" /> KEY ACTIONS
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleRotate(selectedDesk.keyId)}
                    disabled={keyOp != null}
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/10 px-3 py-1 text-xs font-semibold text-[var(--t-amber)] hover:bg-[var(--t-amber)]/20 disabled:opacity-50"
                    title="Issue a new key bound to this same desk; the old key is revoked immediately."
                  >
                    <RefreshCw
                      className={`h-3 w-3${keyOp === "rotating" ? " animate-spin" : ""}`}
                    />
                    ROTATE KEY
                  </button>
                  <button
                    onClick={() => handleRevoke(selectedDesk.keyId)}
                    disabled={keyOp != null}
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--t-red)]/50 bg-[var(--t-red)]/10 px-3 py-1 text-xs font-semibold text-[var(--t-red)] hover:bg-[var(--t-red)]/20 disabled:opacity-50"
                    title="Permanently disable this key. Desk remains; traders/deals continue under any other unrevoked key for this desk."
                  >
                    {keyOp === "revoking" ? (
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
                  <div className="mt-3">
                    <OneTimeKeyReveal
                      keyValue={rotatedKey}
                      onCopy={copy}
                      footer={
                        <>
                          Paste this into{" "}
                          <code className="font-mono">MARGIN_CALL_MCP_KEY</code>{" "}
                          in your MCP client config (Claude Code / Cursor). The
                          old key has already been revoked.
                        </>
                      }
                    />
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
              Select a desk above to manage its keys or inspect its audit trail.
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
