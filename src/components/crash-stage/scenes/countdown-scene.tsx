"use client";

import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { formatCountdown } from "@/lib/utils";

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
  /** When true, show LOCKED instead of a numeral. */
  locked?: boolean;
  frozen?: boolean;
};

/**
 * Giant floating phosphor countdown. Numeral motion runs in useFrame via refs
 * so parent React trees are not re-rendered at 60fps.
 */
export function CountdownScene({
  seconds,
  urgency,
  locked = false,
  frozen = false,
}: CountdownSceneProps) {
  const groupRef = useRef<Group>(null);
  const label = locked
    ? "LOCKED"
    : seconds === null
      ? "—"
      : formatCountdown(seconds);
  const color = URGENCY_COLOR[urgency];
  const fontSize = locked ? 1.4 : 2.4;

  const pulse = useMemo(
    () => ({
      amp: urgency === "threat" ? 0.06 : urgency === "warn" ? 0.03 : 0.015,
    }),
    [urgency]
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    if (frozen) {
      group.position.y = 0.4;
      group.rotation.y = 0;
      return;
    }
    const t = clock.getElapsedTime();
    group.position.y = 0.4 + Math.sin(t * 0.9) * pulse.amp * 4;
    group.rotation.y = Math.sin(t * 0.35) * 0.08;
    const scale =
      urgency === "threat"
        ? 1 + Math.sin(t * Math.PI * 2) * 0.04
        : 1 + Math.sin(t * 1.2) * 0.01;
    group.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} position={[0, 0.4, 0]}>
      <Text
        anchorX="center"
        anchorY="middle"
        color={color}
        fontSize={fontSize}
        letterSpacing={0.08}
        outlineColor="#090b10"
        outlineWidth={0.04}
      >
        {label}
      </Text>
      <mesh position={[0, -1.6, -0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 48]} />
        <meshBasicMaterial color={color} opacity={0.08} transparent />
      </mesh>
    </group>
  );
}
