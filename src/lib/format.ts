export function fmtMoney(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value))
    return "...";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtSignedMoney(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value))
    return "...";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${fmtMoney(value)}`;
}

export function fmtPct(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function fmtTime(ms: number | string | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtTimeWithSeconds(ms: number | string | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
