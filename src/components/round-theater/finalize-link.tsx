import { theaterCopy } from "./theater-copy";

/** Explorer link to the finalization transaction. Renders nothing without a URL. */
export function FinalizeLink({
  url,
  className,
}: {
  url: string | null;
  className?: string;
}) {
  if (!url) return null;
  return (
    <a
      className={`text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]${className ? ` ${className}` : ""}`}
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      {theaterCopy.viewFinalization}
    </a>
  );
}
