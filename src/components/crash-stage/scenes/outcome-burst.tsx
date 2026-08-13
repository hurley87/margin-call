"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import type { TicketLanding } from "@/components/round-theater/landing-frame";

export type OutcomeBurstProps = {
  kind: TicketLanding["kind"];
};

type Particle = {
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
};

const PARTICLE_COUNT = 90;
const WIN_COLORS = ["#92f5b8", "#79d49b", "#d6a660", "#f0d29a"] as const;
const LOSS_COLOR = "#ff6b5c";

function seedParticles(isWin: boolean): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 5) * 0.17;
    const speed = isWin ? 1.1 + (i % 7) * 0.18 : 1.2 + (i % 7) * 0.15;
    list.push({
      vx: Math.cos(angle) * speed * (isWin ? 0.85 : 1),
      vy: isWin ? 1.6 + (i % 5) * 0.28 : (i % 3) * 0.4 - 0.2,
      vz: Math.sin(angle) * speed * (isWin ? 0.85 : 1),
      life: 0,
      color: isWin ? WIN_COLORS[i % WIN_COLORS.length]! : LOSS_COLOR,
    });
  }
  return list;
}

/**
 * Win fountain (green/amber particles rising) or shatter (red scatter).
 * Outcome labels live on the DOM graph, not in the pit.
 */
export function OutcomeBurst({ kind }: OutcomeBurstProps) {
  const groupRef = useRef<Group>(null);
  const particlesRef = useRef<Particle[]>(seedParticles(false));
  const isWin = kind === "won";
  const colors = useMemo(
    () => seedParticles(isWin).map((p) => p.color),
    [isWin]
  );

  useEffect(() => {
    particlesRef.current = seedParticles(isWin);
  }, [isWin]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const sim = particlesRef.current;
    if (!group) return;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i] as Mesh | undefined;
      const p = sim[i];
      if (!child || !p) continue;
      p.life += delta;
      if (isWin) {
        child.position.x += p.vx * delta;
        child.position.y += (p.vy - p.life * 0.35) * delta;
        child.position.z += p.vz * delta;
        child.rotation.z += delta * 2.2;
      } else {
        child.position.x += p.vx * delta;
        child.position.y += (p.vy - 2.2 * p.life) * delta;
        child.position.z += p.vz * delta;
        child.rotation.x += delta * 4;
        child.rotation.z += delta * 3;
      }
      const lifeSpan = isWin ? 3.2 : 2.2;
      const fade = Math.max(0, 1 - p.life / lifeSpan);
      child.scale.setScalar((isWin ? 0.85 : 0.6) * fade + 0.2);
      child.visible = fade > 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh key={i} position={[0, 0.2, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial
            color={colors[i] ?? LOSS_COLOR}
            emissive={colors[i] ?? LOSS_COLOR}
            emissiveIntensity={isWin ? 1.05 : 0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
