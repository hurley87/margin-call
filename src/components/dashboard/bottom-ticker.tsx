"use client";

import { usePrivy } from "@privy-io/react-auth";

import { useClock } from "@/hooks/use-clock";
import { useNarrative } from "@/hooks/use-narrative";
import { fmtTimeWithSeconds } from "@/lib/format";

export function BottomTicker() {
  const { data: narrative } = useNarrative();
  const { user } = usePrivy();
  const nowMs = useClock();

  const walletLinked = Boolean(user?.wallet?.address);
  const epoch = narrative?.epoch;
  const mood = narrative?.world_state?.mood;
  const secHeat = narrative?.world_state?.sec_heat;

  const time = nowMs === null ? "--:--:--" : fmtTimeWithSeconds(nowMs);

  return (
    <footer className="sticky bottom-0 z-30 border-t border-[var(--t-border)] bg-[var(--t-panel-strong)] backdrop-blur supports-[backdrop-filter]:bg-[var(--t-panel)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[10px] tracking-wider">
        <Cell label="SYSTEM" value="ALL SYSTEMS GO" tone="green" />
        <Cell label="NETWORK" value="BASE · LIVE" tone="green" />
        <Cell label="WALLET" value={walletLinked ? "LINKED" : "—"} />
        {epoch !== undefined && <Cell label="EPOCH" value={String(epoch)} />}
        {mood && <Cell label="MOOD" value={mood.toUpperCase()} tone="amber" />}
        {typeof secHeat === "number" && (
          <Cell
            label="SEC HEAT"
            value={`${secHeat}/10`}
            tone={secHeat >= 7 ? "red" : secHeat >= 4 ? "amber" : "muted"}
          />
        )}
        <span className="ml-auto tabular-nums text-[var(--t-muted)]">
          {time}
        </span>
      </div>
    </footer>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red" | "muted";
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--t-green)]"
      : tone === "amber"
        ? "text-[var(--t-amber)]"
        : tone === "red"
          ? "text-[var(--t-red)]"
          : tone === "muted"
            ? "text-[var(--t-muted)]"
            : "text-[var(--t-text)]";
  return (
    <span className="flex items-center gap-1">
      <span className="text-[var(--t-muted)]">{label}:</span>
      <span className={`font-bold ${toneClass}`}>{value}</span>
    </span>
  );
}
