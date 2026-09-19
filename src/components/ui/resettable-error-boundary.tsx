"use client";

import { Component, type ReactNode } from "react";

type ResettableErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered in place of `children`; calling `reset` re-mounts them. */
  fallback: (reset: () => void) => ReactNode;
};

type ResettableErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches a render throw and offers the caller's own retry chrome.
 *
 * The fallback is a render prop rather than a variant flag so each surface can
 * bring its own styling without this class knowing any of them exist.
 */
export class ResettableErrorBoundary extends Component<
  ResettableErrorBoundaryProps,
  ResettableErrorBoundaryState
> {
  state: ResettableErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ResettableErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(() => this.setState({ error: null }));
    }
    return this.props.children;
  }
}
