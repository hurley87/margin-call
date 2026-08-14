"use client";

import { useLogin } from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import { GameButton } from "@/components/ui/game-button";

/**
 * Floor / entry dock sign-in CTA. Same Privy login as AuthControls, sized for
 * the action dock so a first-time visitor has something to click.
 */
export function SignInCta({
  className,
  size = "hero",
}: {
  className?: string;
  size?: "default" | "sm" | "lg" | "hero";
}) {
  const [loginError, setLoginError] = useState(false);
  const { login } = useLogin({
    onError: () => setLoginError(true),
  });

  const handleLogin = useCallback(() => {
    setLoginError(false);
    login();
  }, [login]);

  return (
    <div className={className}>
      <GameButton
        className="w-full bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
        data-testid="sign-in-cta"
        onClick={handleLogin}
        size={size}
      >
        Continue with phone
      </GameButton>
      <p className="mt-2 text-xs leading-5 text-[var(--t-muted)]">
        No wallet app, seed phrase, or test ETH — claim free Desk Dollars after
        you sign in.
      </p>
      {loginError ? (
        <p className="mt-2 text-sm text-[var(--t-red)]" role="alert">
          Sign-in did not complete. Try again.
        </p>
      ) : null}
    </div>
  );
}
