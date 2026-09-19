import type { SVGProps } from "react";

type IconKind = "paw" | "chart" | "shield" | "heart";

/** Small, rounded line drawings shared by the wordmark and welcome page. */
export function PlayfulIcon({
  kind,
  ...props
}: SVGProps<SVGSVGElement> & { kind: IconKind }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {kind === "paw" ? (
        <>
          <ellipse
            cx="10"
            cy="19"
            rx="3.2"
            ry="5"
            transform="rotate(-20 10 19)"
          />
          <ellipse cx="19" cy="9" rx="3.2" ry="5" transform="rotate(-8 19 9)" />
          <ellipse cx="31" cy="9" rx="3.2" ry="5" transform="rotate(12 31 9)" />
          <ellipse
            cx="39"
            cy="20"
            rx="3.2"
            ry="5"
            transform="rotate(22 39 20)"
          />
          <path d="M14 30c3-5 5-9 10-9s8 5 11 10c3 5 3 11-2 12-4 1-5-3-9-3s-6 4-10 2c-5-2-3-8 0-12Z" />
        </>
      ) : null}
      {kind === "chart" ? (
        <path d="m5 42 1-17 11-1v18M17 42V15l11-1v28M28 42l1-37 12 1-1 36M5 42h36" />
      ) : null}
      {kind === "shield" ? (
        <path d="M24 4c6 5 10 6 17 6l-2 15c-2 9-8 15-15 19C14 38 9 32 8 24L7 10c7 0 12-2 17-6Z" />
      ) : null}
      {kind === "heart" ? (
        <path d="M24 42 8 24C-3 10 15-4 24 14 32-4 51 8 40 24L24 42Z" />
      ) : null}
    </svg>
  );
}
