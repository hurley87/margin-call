import { BPS_DENOMINATOR } from "@/lib/protocol/constants";

export type LiveExposure =
  | { kind: "unlevered"; label: "1.0x" }
  | { kind: "levered"; label: string }
  | { kind: "pricing-unavailable" }
  | { kind: "equity-exhausted" };

/**
 * Current leverage from live protocol state.
 * Zero debt is 1.0x without NAV. Outstanding debt needs LIVE NAV; never invents a number.
 */
export function liveExposure(args: {
  nav: bigint | null;
  currentDebt: bigint;
}): LiveExposure {
  if (args.currentDebt === 0n) {
    return { kind: "unlevered", label: "1.0x" };
  }
  if (args.nav == null) {
    return { kind: "pricing-unavailable" };
  }
  if (args.nav <= args.currentDebt) {
    return { kind: "equity-exhausted" };
  }

  const equity = args.nav - args.currentDebt;
  const bps = (args.nav * BigInt(BPS_DENOMINATOR)) / equity;
  const whole = bps / BigInt(BPS_DENOMINATOR);
  const hundredths = (bps % BigInt(BPS_DENOMINATOR)) / 100n;
  return {
    kind: "levered",
    label: `${whole.toString()}.${hundredths.toString().padStart(2, "0")}x`,
  };
}

/** Display text for a leverage row, or null when there is nothing honest to show. */
export function exposureLabel(exposure: LiveExposure): string | null {
  switch (exposure.kind) {
    case "unlevered":
    case "levered":
      return exposure.label;
    case "equity-exhausted":
      return "Equity exhausted";
    case "pricing-unavailable":
      return null;
    default: {
      const _exhaustive: never = exposure;
      return _exhaustive;
    }
  }
}
