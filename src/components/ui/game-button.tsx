import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const gameButtonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 border font-mono text-sm font-black uppercase tracking-[0.16em] transition-[color,background-color,border-color,transform] duration-[var(--mc-dur-fast)] ease-[var(--mc-ease-snap)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-50 active:enabled:scale-[0.97]",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--t-accent)] bg-[var(--t-panel-strong)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]",
        secondary:
          "border-[var(--t-divider)] bg-transparent text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]",
        ghost:
          "border-transparent bg-transparent text-[var(--t-muted)] hover:text-[var(--t-accent)]",
        danger:
          "border-[var(--t-red)]/60 bg-[var(--t-red)]/10 text-[var(--t-red)] hover:border-[var(--t-red)] hover:bg-[var(--t-red)]/20",
      },
      size: {
        default: "px-6 py-3",
        sm: "min-h-9 px-3 py-2 text-[11px] tracking-[0.14em]",
        lg: "min-h-12 px-8 py-3.5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof gameButtonVariants> & {
    children: ReactNode;
  };

export function GameButton({
  className,
  variant,
  size,
  children,
  type = "button",
  ...props
}: GameButtonProps) {
  return (
    <button
      type={type}
      className={cn(gameButtonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}

export { gameButtonVariants };
