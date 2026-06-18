"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { Check, Copy, Terminal, X } from "lucide-react";

import { DIALOG_BACKDROP_CLASS, cn, dialogPopupClass } from "@/lib/utils";

const INSTALL_CMD =
  "claude mcp add margin-call -- npx -y @margin-call/mcp-server";
const DOCS_URL = "https://margin-call.gitbook.io/product-docs";

const noopSubscribe = () => () => {};
function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
}

/**
 * Homepage onboarding affordance for MCP users. Renders a secondary "Connect
 * via MCP" trigger beside the primary Privy email button and opens an
 * instructions-only modal. The user's AI agent runs the SIWE key issuance
 * itself (get_wallets → /api/mcp/keys/challenge → sign → /api/mcp/keys), so no
 * browser wallet connector or new backend is needed here.
 */
export function ConnectMcpDialog() {
  const origin = useOrigin();
  const pluginUrl = origin ? `${origin}/api/mcp/plugin` : "";

  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex min-h-11 items-center gap-2 border border-[var(--t-divider)] px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none">
        <Terminal className="h-4 w-4" />
        Connect via MCP
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("lg")}>
          <div className="flex items-center justify-between border-b border-[var(--t-divider)] bg-[#0b100d] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
                Agent desk
              </p>
              <Dialog.Title className="mt-1 font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Connect via MCP
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center border border-[var(--t-divider)] text-[var(--t-muted)] hover:border-[var(--t-red)] hover:text-[var(--t-red)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
            >
              <X className="h-3.5 w-3.5" />
            </Dialog.Close>
          </div>

          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 text-xs leading-relaxed text-[var(--t-text)] sm:max-h-[calc(88vh-9rem)]">
            <p className="text-[var(--t-green)]/90">
              Run your desk from any MCP-capable AI agent (Claude Code, Cursor,
              Codex). Your agent mints a per-desk key by signing a message with
              your Base Account — no email, no web login.
            </p>

            <ol className="mt-4 grid gap-3">
              <Step index="01" title="Add the server to your agent">
                <CodeRow value={INSTALL_CMD} />
              </Step>
              <Step index="02" title="Or point your agent at the plugin spec">
                <CodeRow value={pluginUrl} placeholder="Loading URL…" />
              </Step>
              <Step index="03" title='Tell your agent: "join Margin Call"'>
                <p className="text-[var(--t-green)]/90">
                  It runs{" "}
                  <code className="text-[var(--t-accent)]">get_wallets</code>{" "}
                  and the SIWE handshake, then mints your one-time{" "}
                  <code className="text-[var(--t-accent)]">mc_live_</code> key
                  and binds your Base Account as the desk treasury.
                </p>
              </Step>
            </ol>

            <div className="mt-4 border border-[var(--t-divider)] bg-[#070b09] p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
                MCP client env
              </p>
              <dl className="mt-2 grid gap-1.5 text-[11px]">
                <div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-2">
                  <dt className="text-[var(--t-muted)]">MARGIN_CALL_MCP_KEY</dt>
                  <dd className="truncate text-[var(--t-green)]/90">
                    mc_live_… (returned after sign-in)
                  </dd>
                </div>
                <div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-2">
                  <dt className="text-[var(--t-muted)]">MARGIN_CALL_API_URL</dt>
                  <dd className="truncate text-[var(--t-green)]/90">
                    {origin || "this app's URL"}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-[var(--t-muted)]">
                Chat-only surfaces (Claude.ai, ChatGPT) use the same standalone
                stdio server.
              </p>
            </div>

            <p className="mt-4 border-t border-[var(--t-divider)] pt-3 text-center text-[11px] text-[var(--t-muted)]">
              Need details?{" "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--t-accent)] underline-offset-2 hover:underline"
              >
                Read the docs
              </a>
              {pluginUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={pluginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--t-accent)] underline-offset-2 hover:underline"
                  >
                    View plugin spec
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border border-[var(--t-divider)] bg-[#070b09] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--t-muted)]">{index}</span>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--t-accent)]">
          {title}
        </h3>
      </div>
      <div className="mt-2">{children}</div>
    </li>
  );
}

function CodeRow({
  value,
  placeholder,
}: {
  value: string;
  placeholder?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap border border-[var(--t-divider)] bg-[#050706] px-2.5 py-2 text-[11px] text-[var(--t-text)]">
        {value || placeholder || ""}
      </code>
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        title="Copy"
        aria-label="Copy"
        className={cn(
          "grid w-9 shrink-0 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40"
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
