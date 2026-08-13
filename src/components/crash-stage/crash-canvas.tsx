"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { TicketTapeEntry } from "@/lib/margin-call-crash";
import type { LandingPresentation } from "@/components/round-theater/landing-frame";
import type { CrashStageMode } from "./use-crash-stage-mode";
import {
  CountdownScene,
  type CountdownUrgency,
} from "./scenes/countdown-scene";
import { TicketField, type TicketChipState } from "./scenes/ticket-field";
import { ReplayScene } from "./scenes/replay-scene";
import { OutcomeBurst } from "./scenes/outcome-burst";

export type CrashCanvasProps = {
  mode: CrashStageMode;
  countdownSeconds: number | null;
  urgency: CountdownUrgency;
  locked: boolean;
  entries: readonly TicketTapeEntry[];
  playerAddress: string | null;
  crashPointBps: bigint | null;
  replayProgress: number;
  playerTierBps: bigint | null;
  chipStates: ReadonlyMap<string, TicketChipState>;
  landing: LandingPresentation | null;
};

/**
 * Dumb R3F canvas: scene props in, no wallet or transaction imports.
 * Pauses the renderer when the document is hidden.
 */
export function CrashCanvas(props: CrashCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 7.5], fov: 42, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#090b10"]} />
      <fog attach="fog" args={["#090b10", 8, 22]} />
      <ambientLight intensity={0.35} />
      <pointLight color="#d6a660" intensity={1.2} position={[4, 6, 4]} />
      <pointLight color="#7ec8ff" intensity={0.55} position={[-5, 3, -2]} />
      <VisibilityGate />
      <IdleCamera />
      <StageContent {...props} />
      <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial
          color="#12151c"
          metalness={0.4}
          roughness={0.85}
        />
      </mesh>
    </Canvas>
  );
}

function VisibilityGate() {
  const { gl, set, invalidate } = useThree();
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) {
        set({ frameloop: "never" });
        gl.domElement.style.visibility = "hidden";
      } else {
        gl.domElement.style.visibility = "visible";
        set({ frameloop: "always" });
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [gl, invalidate, set]);
  return null;
}

function IdleCamera() {
  const base = useRef({ x: 0, y: 1.2, z: 7.5 });
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    camera.position.x = base.current.x + Math.sin(t * 0.15) * 0.35;
    camera.position.y = base.current.y + Math.sin(t * 0.22) * 0.12;
    camera.lookAt(0, 0.3, 0);
  });
  return null;
}

function StageContent(props: CrashCanvasProps) {
  const showCountdown =
    props.mode === "countdown" ||
    props.mode === "awaiting-settle" ||
    props.mode === "expired" ||
    props.mode === "loading";

  const showReplay = props.mode === "replay" && props.crashPointBps !== null;
  const showOutcome = props.mode === "outcome" && props.landing !== null;

  const frozen = props.mode === "awaiting-settle" || props.mode === "expired";

  const chipStates = useMemo(() => props.chipStates, [props.chipStates]);

  return (
    <>
      {showCountdown ? (
        <CountdownScene
          frozen={frozen}
          locked={props.locked}
          seconds={props.countdownSeconds}
          urgency={props.urgency}
        />
      ) : null}
      {(showCountdown || showReplay) && props.mode !== "loading" ? (
        <TicketField
          chipStates={chipStates}
          entries={props.entries}
          frozen={frozen || showReplay}
          playerAddress={props.playerAddress}
        />
      ) : null}
      {showReplay && props.crashPointBps !== null ? (
        <ReplayScene
          crashPointBps={props.crashPointBps}
          playerTierBps={props.playerTierBps}
          progress={props.replayProgress}
        />
      ) : null}
      {showOutcome && props.landing ? (
        <OutcomeBurst landing={props.landing} />
      ) : null}
    </>
  );
}
