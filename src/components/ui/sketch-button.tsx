"use client";

import { DrawablyButton } from "drawably/react";
import type { ComponentProps } from "react";

/** Native button behavior with a quiet, hand-drawn outline. */
export function SketchButton(props: ComponentProps<typeof DrawablyButton>) {
  return (
    <DrawablyButton
      seed={42}
      roughness={0.7}
      boil={0}
      data-slot="button"
      {...props}
    />
  );
}
