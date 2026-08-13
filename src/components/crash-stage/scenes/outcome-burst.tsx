"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group, Mesh } from "three";

export type OutcomeBurstProps = {
  /** Personal wins use WinConfetti; the pit only shatters on a margin call. */
  kind: "margin-called" | "spectator";
};

type Particle = {
  vx: number;
  vy: number;
  vz: number;
  life: number;
};

const PARTICLE_COUNT = 36;
const COLOR = "#ff6b5c";

function seedParticles(): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const speed = 1.2 + (i % 7) * 0.15;
    list.push({
      vx: Math.cos(angle) * speed,
      vy: (i % 3) * 0.4 - 0.2,
      vz: Math.sin(angle) * speed,
      life: 0,
    });
  }
  return list;
}

/**
 * Margin-call shatter in the pit. Win celebration lives in WinConfetti so the
 * Floor does not run two particle systems for the same moment.
 */
export function OutcomeBurst({ kind }: OutcomeBurstProps) {
  const groupRef = useRef<Group>(null);
  const particlesRef = useRef<Particle[]>(seedParticles());

  useEffect(() => {
    particlesRef.current = seedParticles();
  }, [kind]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const sim = particlesRef.current;
    if (!group) return;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i] as Mesh | undefined;
      const p = sim[i];
      if (!child || !p) continue;
      p.life += delta;
      child.position.x += p.vx * delta;
      child.position.y += (p.vy - 2.2 * p.life) * delta;
      child.position.z += p.vz * delta;
      child.rotation.x += delta * 4;
      child.rotation.z += delta * 3;
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
            color={COLOR}
            emissive={COLOR}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
