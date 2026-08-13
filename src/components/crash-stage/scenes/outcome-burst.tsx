"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import type { TicketLanding } from "@/components/round-theater/landing-frame";

export type OutcomeBurstProps = {
  kind: TicketLanding["kind"];
};

type Particle = {
  vx: number;
  vy: number;
  vz: number;
  life: number;
};

const PARTICLE_COUNT = 36;

function seedParticles(isWin: boolean): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const speed = isWin ? 0.8 + (i % 5) * 0.1 : 1.2 + (i % 7) * 0.15;
    list.push({
      vx: Math.cos(angle) * speed * (isWin ? 0.35 : 1),
      vy: isWin ? 1.2 + (i % 4) * 0.2 : (i % 3) * 0.4 - 0.2,
      vz: Math.sin(angle) * speed * (isWin ? 0.35 : 1),
      life: 0,
    });
  }
  return list;
}

/**
 * Win fountain (green particles rising) or shatter (red scatter).
 * Outcome labels live on the DOM graph, not in the pit.
 */
export function OutcomeBurst({ kind }: OutcomeBurstProps) {
  const groupRef = useRef<Group>(null);
  const particlesRef = useRef<Particle[]>(seedParticles(false));
  const isWin = kind === "won";
  const color = isWin ? "#92f5b8" : "#ff6b5c";

  useEffect(() => {
    particlesRef.current = seedParticles(isWin);
  }, [isWin]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const sim = particlesRef.current;
    if (!group) return;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      const p = sim[i];
      if (!child || !p) continue;
      p.life += delta;
      if (isWin) {
        child.position.x += p.vx * delta;
        child.position.y += (p.vy - p.life * 0.4) * delta;
        child.position.z += p.vz * delta;
      } else {
        child.position.x += p.vx * delta;
        child.position.y += (p.vy - 2.2 * p.life) * delta;
        child.position.z += p.vz * delta;
        child.rotation.x += delta * 4;
        child.rotation.z += delta * 3;
      }
      const fade = Math.max(0, 1 - p.life / 2.2);
      child.scale.setScalar(0.6 * fade + 0.2);
      child.visible = fade > 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh key={i} position={[0, 0.2, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
