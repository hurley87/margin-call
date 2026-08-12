/**
 * Inline red desk phone for the margin-call hard stop.
 * Pure SVG — no asset files.
 */
export function MarginCallPhone({ ringing = false }: { ringing?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${ringing ? "mc-phone-ring" : ""}`}
    >
      <svg
        fill="none"
        height="48"
        viewBox="0 0 48 48"
        width="48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          fill="#1a0e0c"
          height="28"
          rx="3"
          stroke="var(--t-red-hot)"
          strokeWidth="1.5"
          width="32"
          x="8"
          y="14"
        />
        <path
          d="M14 14c0-6 4-10 10-10s10 4 10 10"
          stroke="var(--t-red)"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle cx="24" cy="28" fill="var(--t-red-hot)" r="4" />
        <rect fill="var(--t-red)" height="3" rx="1" width="18" x="15" y="18" />
      </svg>
    </div>
  );
}
