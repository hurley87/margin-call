"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useConvexTraders,
  useConvexCreateTrader,
} from "@/hooks/use-convex-traders";
import { Nav } from "@/components/nav";
import type { Mandate } from "@/lib/agent/evaluator";

type Option<T> = { label: string; sub: string; value: T };

const STEPS = {
  NAME: 0,
  RISK: 1,
  DEAL_SIZE: 2,
  POT_SIZE: 3,
  OVERSIGHT: 4,
} as const;

const RISK_OPTIONS: Option<number>[] = [
  { label: "PLAYS IT SAFE", sub: "Small bets, steady gains", value: 10 },
  { label: "CALCULATED RISKS", sub: "Nothing too crazy", value: 25 },
  { label: "GO BIG OR GO HOME", sub: "Swing for the fences", value: 50 },
  { label: "FULL SEND", sub: "Bet the whole desk", value: 75 },
];

const DEAL_SIZE_OPTIONS: Option<number | null>[] = [
  { label: "PENNY ANTE", sub: "$0.50 max", value: 0.5 },
  { label: "MID-STAKES", sub: "$2 max", value: 2 },
  { label: "HIGH ROLLER", sub: "$5 max", value: 5 },
  { label: "NO LIMIT", sub: "Let them cook", value: null },
];

const POT_SIZE_OPTIONS: Option<number | null>[] = [
  { label: "SCRAPPY", sub: "Any pot will do", value: null },
  { label: "WORTH MY TIME", sub: "$1 or more", value: 1 },
  { label: "BIG GAME ONLY", sub: "$5 or more", value: 5 },
  { label: "WHALE TERRITORY", sub: "$10 or more", value: 10 },
];

const OVERSIGHT_OPTIONS: Option<number | null>[] = [
  { label: "NEVER", sub: "I trust them completely", value: null },
  { label: "BIG MOVES ONLY", sub: "Over $3", value: 3 },
  { label: "ANYTHING OVER A BUCK", sub: "$1+", value: 1 },
  { label: "EVERY. SINGLE. DEAL.", sub: "$0.01 threshold", value: 0.01 },
];

const STEP_TITLES = [
  "WHAT DO THEY CALL YOU ON THE FLOOR?",
  "HOW DOES YOUR TRADER HANDLE RISK?",
  "WHAT'S THE BIGGEST BUY-IN YOUR TRADER WILL STOMACH?",
  "WHAT KIND OF POTS ARE WORTH CHASING?",
  "WHEN SHOULD YOUR TRADER CHECK WITH YOU?",
] as const;

export default function NewTraderWizard() {
  const router = useRouter();
  const traders = useConvexTraders();
  const createTrader = useConvexCreateTrader();

  const [step, setStep] = useState<number>(STEPS.NAME);
  const [name, setName] = useState("");
  const [mandate, setMandate] = useState<Mandate>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();

  const trimmedName = name.trim();
  const nameTaken =
    trimmedName.length > 0 &&
    (traders ?? []).some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
  const canAdvanceName = trimmedName.length > 0 && !nameTaken;

  function setMandateField(
    key: Exclude<keyof Mandate, "keywords" | "max_pot_usdc">,
    value: number | null,
    nextStep: number
  ) {
    setMandate((m) => {
      const next = { ...m };
      if (value !== null) {
        (next[key] as number) = value;
      } else {
        delete next[key];
      }
      return next;
    });
    setStep(nextStep);
  }

  async function submitTrader(value: number | null) {
    const finalMandate: Mandate = { ...mandate };
    if (value !== null) finalMandate.approval_threshold_usdc = value;
    else delete finalMandate.approval_threshold_usdc;

    setIsCreating(true);
    setCreateError(undefined);
    try {
      const traderId = await createTrader({
        name: trimmedName,
        mandate: finalMandate,
      });
      router.push(`/traders/${traderId}`);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create trader"
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />
      <div className="sticky top-[37px] z-20 border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-1.5 text-xs">
          <Link
            href="/traders"
            className="text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
          >
            &larr; BACK
          </Link>
          <span className="text-[var(--t-text)]">NEW TRADER</span>
          <span className="text-[var(--t-muted)]">STEP {step + 1} / 5</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 transition-colors ${
                i <= step ? "bg-[var(--t-accent)]" : "bg-[var(--t-border)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
          <h2 className="mb-6 text-sm font-bold text-[var(--t-accent)]">
            {STEP_TITLES[step]}
          </h2>

          {step === STEPS.NAME && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canAdvanceName) setStep(STEPS.RISK);
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gecko"
                maxLength={50}
                autoFocus
                className="mb-4 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
              />
              {nameTaken && (
                <p className="mb-4 text-sm text-[var(--t-amber)]">
                  NAME TAKEN — CHOOSE A UNIQUE NAME
                </p>
              )}
              <button
                type="submit"
                disabled={!canAdvanceName}
                className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-6 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
              >
                NEXT &rarr;
              </button>
            </form>
          )}

          {step === STEPS.RISK && (
            <OptionGrid
              options={RISK_OPTIONS}
              onSelect={(v) =>
                setMandateField("bankroll_pct", v, STEPS.DEAL_SIZE)
              }
            />
          )}

          {step === STEPS.DEAL_SIZE && (
            <OptionGrid
              options={DEAL_SIZE_OPTIONS}
              onSelect={(v) =>
                setMandateField("max_entry_cost_usdc", v, STEPS.POT_SIZE)
              }
            />
          )}

          {step === STEPS.POT_SIZE && (
            <OptionGrid
              options={POT_SIZE_OPTIONS}
              onSelect={(v) =>
                setMandateField("min_pot_usdc", v, STEPS.OVERSIGHT)
              }
            />
          )}

          {step === STEPS.OVERSIGHT && (
            <div>
              <OptionGrid
                options={OVERSIGHT_OPTIONS}
                onSelect={submitTrader}
                disabled={isCreating}
              />
              {isCreating && (
                <p className="mt-4 text-sm text-[var(--t-muted)]">
                  Creating trader... wallet provisioning will complete shortly.
                </p>
              )}
              {createError && (
                <p className="mt-4 text-sm text-[var(--t-red)]">
                  {createError}
                </p>
              )}
            </div>
          )}
        </div>

        {step > STEPS.NAME && !isCreating && (
          <button
            onClick={() => {
              if (step === STEPS.RISK) setMandate({});
              setStep(step - 1);
            }}
            className="mt-4 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
          >
            &larr; BACK A STEP
          </button>
        )}
      </div>
    </div>
  );
}

function OptionGrid<T>({
  options,
  onSelect,
  disabled,
}: {
  options: Option<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onSelect(opt.value)}
          disabled={disabled}
          className="border border-[var(--t-border)] bg-[var(--t-bg)] p-4 text-left transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-50"
        >
          <span className="block text-sm font-bold text-[var(--t-text)]">
            {opt.label}
          </span>
          <span className="mt-1 block text-xs text-[var(--t-muted)]">
            {opt.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
