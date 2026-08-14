"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";

export type CountdownUrgency = "calm" | "warn" | "threat" | "locked";

const URGENCY_COLOR: Record<CountdownUrgency, string> = {
  calm: "#92f5b8",
  warn: "#f5c26b",
  threat: "#ff6b5c",
  locked: "#d6a660",
};

export type CountdownSceneProps = {
  /** Seconds remaining, or null when locked / no countdown. */
  seconds: number | null;
  urgency: CountdownUrgency;
  /** When true, freeze motion (locked / settling / expired). */
  locked?: boolean;
  frozen?: boolean;
  /** Public tape size — drives chip-stack height. */
  entryCount?: number;
};

const MAX_STACK = 12;
const CHIP_HEIGHT = 0.09;
const CHIP_RADIUS = 0.55;

/**
 * Pit centerpiece: a growing chip stack tinted by countdown urgency.
 * Motion runs in useFrame via refs so parent React trees are not re-rendered
 * at 60fps. The HUD dial owns the clock numerals.
 */
export function CountdownScene({
  urgency,
  locked = false,
  frozen = false,
  entryCount = 0,
}: CountdownSceneProps) {
  const groupRef = useRef<Group>(null);
  const rimRef = useRef<Mesh>(null);
  const color = URGENCY_COLOR[urgency];
  const stackCount = Math.min(
    MAX_STACK,
    Math.max(2, Math.ceil(entryCount / 2) + 2)
  );

  const pulse = useMemo(
    () => ({
      amp: urgency === "threat" ? 0.05 : urgency === "warn" ? 0.025 : 0.012,
    }),
    [urgency]
  );

  const chips = useMemo(
    () =>
      Array.from({ length: stackCount }, (_, i) => ({
        y: i * CHIP_HEIGHT,
        scale: 1 - i * 0.012,
        hueShift: i % 2 === 0 ? color : "#d6a660",
      })),
    [stackCount, color]
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    if (frozen || locked) {
      group.position.y = 0.15;
      group.rotation.y = 0;
      if (rimRef.current) {
        rimRef.current.scale.setScalar(1);
      }
      return;
    }
    const t = clock.getElapsedTime();
    group.position.y = 0.15 + Math.sin(t * 0.9) * pulse.amp * 3;
    group.rotation.y = t * 0.18;
    if (rimRef.current) {
      const scale =
        urgency === "threat"
          ? 1 + Math.sin(t * Math.PI * 2) * 0.06
          : 1 + Math.sin(t * 1.1) * 0.02;
      rimRef.current.scale.setScalar(scale);
    }
  });

  const emissiveIntensity = locked
    ? 0.12
    : urgency === "threat"
      ? 0.55
      : urgency === "warn"
        ? 0.38
        : 0.28;

  return (
    <group ref={groupRef} position={[0, 0.15, 0]}>
      {chips.map((chip, index) => (
        <mesh
          key={index}
          position={[0, chip.y, 0]}
          scale={[chip.scale, 1, chip.scale]}
        >
          <cylinderGeometry
            args={[CHIP_RADIUS, CHIP_RADIUS, CHIP_HEIGHT, 32]}
          />
          <meshStandardMaterial
            color={chip.hueShift}
            emissive={chip.hueShift}
            emissiveIntensity={emissiveIntensity}
            metalness={0.35}
            roughness={0.4}
            transparent={locked}
            opacity={locked ? 0.55 : 1}
          />
        </mesh>
      ))}
      <mesh
        ref={rimRef}
        position={[0, -0.08, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.75, 1.15, 64]} />
        <meshBasicMaterial
          color={color}
          opacity={locked ? 0.06 : 0.18}
          transparent
        />
      </mesh>
      <pointLight
        color={color}
        intensity={locked ? 0.3 : urgency === "threat" ? 1.4 : 0.85}
        distance={6}
        position={[0, 1.2, 0]}
      />
    </group>
  );
}
