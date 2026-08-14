"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import type { TicketTapeEntry } from "@/lib/margin-call-crash";
import type { TicketLanding } from "@/components/round-theater/landing-frame";
import type { CrashStageMode } from "./use-crash-stage-mode";
import {
  CountdownScene,
  type CountdownUrgency,
} from "./scenes/countdown-scene";
import { TicketField, type TicketChipState } from "./scenes/ticket-field";
import { OutcomeBurst } from "./scenes/outcome-burst";

export type CrashCanvasProps = {
  mode: CrashStageMode;
  countdownSeconds: number | null;
  urgency: CountdownUrgency;
  locked: boolean;
  entries: readonly TicketTapeEntry[];
  playerAddress: string | null;
  chipStates: ReadonlyMap<string, TicketChipState>;
  outcomeKind: Exclude<TicketLanding["kind"], "won"> | null;
};

/**
 * Dumb R3F canvas: scene props in, no wallet or transaction imports.
 * Pauses the renderer when the document is hidden via Canvas frameloop.
 */
export function CrashCanvas(props: CrashCanvasProps) {
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 1.2, 7.5], fov: 42, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      frameloop={pageVisible ? "always" : "never"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        // React StrictMode's simulated remount makes R3F's delayed unmount
        // cleanup force a context loss on the still-live canvas (the root is
        // reused across the remount), leaving the Floor permanently white in
        // dev. The loss comes from WEBGL_lose_context, so it is restorable;
        // a genuine GPU loss makes forceContextRestore a harmless no-op.
        gl.domElement.addEventListener("webglcontextlost", () => {
          window.setTimeout(() => {
            try {
              gl.forceContextRestore();
            } catch {
              // WEBGL_lose_context unsupported — nothing to restore with.
            }
          }, 1);
        });
      }}
      style={{
        position: "absolute",
        inset: 0,
        visibility: pageVisible ? "visible" : "hidden",
      }}
    >
      <color attach="background" args={["#090b10"]} />
      <fog attach="fog" args={["#090b10", 8, 22]} />
      <ambientLight intensity={0.35} />
      <pointLight color="#d6a660" intensity={1.2} position={[4, 6, 4]} />
      <pointLight color="#7ec8ff" intensity={0.55} position={[-5, 3, -2]} />
      <IdleCamera urgency={props.urgency} />
      <StageContent {...props} />
      <GridHorizon />
    </Canvas>
  );
}

function IdleCamera({ urgency }: { urgency: CountdownUrgency }) {
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const dolly = urgency === "threat" ? 6.6 : urgency === "warn" ? 7.0 : 7.5;
    camera.position.x = Math.sin(t * 0.15) * 0.35;
    camera.position.y = 1.2 + Math.sin(t * 0.22) * 0.12;
    camera.position.z = dolly + Math.sin(t * 0.11) * 0.08;
    camera.lookAt(0, 0.3, 0);
  });
  return null;
}

/**
 * Scrolling trading-floor grid that fades into fog at distance.
 * Position offset runs in useFrame so React never re-renders for the scroll.
 */
function GridHorizon() {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();
    group.position.z = (t * 0.55) % 1.2;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, -2.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial
          color="#0e1118"
          metalness={0.35}
          roughness={0.9}
        />
      </mesh>
      <gridHelper
        args={[22, 22, "#3a4558", "#1c2433"]}
        position={[0, -2.19, 0]}
      />
    </group>
  );
}

function StageContent(props: CrashCanvasProps) {
  const showCountdown =
    props.mode === "countdown" ||
    props.mode === "awaiting-settle" ||
    props.mode === "settling" ||
    props.mode === "expired" ||
    props.mode === "loading";

  const showOutcome = props.mode === "outcome" && props.outcomeKind !== null;
  const showField =
    props.mode !== "loading" &&
    (showCountdown || props.mode === "replay" || props.mode === "outcome");

  const frozen =
    props.mode === "awaiting-settle" ||
    props.mode === "settling" ||
    props.mode === "expired";

  return (
    <>
      {showCountdown ? (
        <CountdownScene
          entryCount={props.entries.length}
          frozen={frozen}
          locked={props.locked}
          seconds={props.countdownSeconds}
          urgency={props.urgency}
        />
      ) : null}
      {showField ? (
        <TicketField
          chipStates={props.chipStates}
          entries={props.entries}
          frozen={frozen || props.mode === "replay" || props.mode === "outcome"}
          playerAddress={props.playerAddress}
        />
      ) : null}
      {showOutcome && props.outcomeKind ? (
        <OutcomeBurst kind={props.outcomeKind} />
      ) : null}
    </>
  );
}
