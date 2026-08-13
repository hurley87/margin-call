import type { ReactNode } from "react";

type RoutePageIntroProps = {
  eyebrow: string;
  title: string;
  titleId: string;
  children: ReactNode;
};

/**
 * Shared desk-route chrome: eyebrow, page title, and one-line lede.
 * Width/layout wrappers stay on the page.
 */
export function RoutePageIntro({
  eyebrow,
  title,
  titleId,
  children,
}: RoutePageIntroProps) {
  return (
    <>
      <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
        {eyebrow}
      </p>
      <h1
        className="mt-2 font-[family-name:var(--font-plex-sans)] text-3xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-4xl"
        id={titleId}
      >
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
        {children}
      </p>
    </>
  );
}
