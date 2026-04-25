"use client";

import { useMemo, useState } from "react";

import { useNarrativeFeed, type FeedHeadline } from "@/hooks/use-narrative";
import { fmtTime } from "@/lib/format";

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: "all" | FeedHeadline["category"];
  label: string;
}> = [
  { value: "all", label: "ALL" },
  { value: "breaking", label: "BREAKING" },
  { value: "rumor", label: "RUMOR" },
  { value: "investigation", label: "SEC" },
  { value: "market_move", label: "MARKET" },
  { value: "corporate_drama", label: "CORP" },
  { value: "politics", label: "POLITICS" },
];

const CATEGORY_LABEL: Record<string, string> = {
  breaking: "BREAKING",
  rumor: "RUMOR",
  investigation: "SEC PROBE",
  market_move: "MARKET MOVE",
  corporate_drama: "CORP DRAMA",
  politics: "POLITICS",
};

const CATEGORY_TONE: Record<string, string> = {
  breaking: "text-[var(--t-red)]",
  rumor: "text-[var(--t-amber)]",
  investigation: "text-[var(--t-amber)]",
  market_move: "text-[var(--t-green)]",
  corporate_drama: "text-[var(--t-accent)]",
  politics: "text-[var(--t-blue)]",
};

function categoryTone(cat: string) {
  return CATEGORY_TONE[cat] ?? "text-[var(--t-muted)]";
}

function categoryLabel(cat: string) {
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, " ").toUpperCase();
}

export function NewswirePanel() {
  const { data: feed, isLoading } = useNarrativeFeed(12);
  const [category, setCategory] = useState<string>("all");

  const items = useMemo(() => {
    if (!feed) return [];
    if (category === "all") return feed;
    return feed.filter((f) => f.category === category);
  }, [feed, category]);

  return (
    <section aria-labelledby="newswire-heading" className="panel h-full">
      <div className="panel-header">
        <h2 id="newswire-heading" className="text-[var(--t-accent)]">
          NEWSWIRE
        </h2>
        <CategoryDropdown value={category} onChange={setCategory} />
      </div>

      <div className="panel-body">
        {isLoading ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--t-muted)]">
            LOADING WIRE...<span className="cursor-blink">█</span>
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-[var(--t-muted)]">
            NO WIRE TRAFFIC
          </div>
        ) : (
          <ul className="divide-y divide-[var(--t-border)]">
            {items.map((item, i) => (
              <li
                key={`${item.epoch}-${i}`}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 px-3 py-2 text-[11px] leading-snug"
              >
                <span className="tabular-nums text-[var(--t-muted)]">
                  {fmtTime(item.created_at)}
                </span>
                <div className="min-w-0">
                  <p className="text-[var(--t-text)]">{item.headline}</p>
                  <p
                    className={`mt-0.5 truncate text-[10px] tracking-wider ${categoryTone(item.category)}`}
                  >
                    {categoryLabel(item.category)}
                    {item.mood ? ` · ${item.mood.toUpperCase()}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CategoryDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] tracking-wider">
      <span className="text-[var(--t-muted)]">FILTER</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[var(--t-border)] bg-[var(--t-bg)] px-1.5 py-0.5 text-[10px] tracking-wider text-[var(--t-accent)] outline-none focus:border-[var(--t-accent)]"
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
