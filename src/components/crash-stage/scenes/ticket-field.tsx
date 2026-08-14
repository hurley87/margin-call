"use client";

import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import {
  formatLeverageBps,
  type TicketTapeEntry,
} from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import { formatShortAddress } from "@/lib/utils";

const MAX_CHIPS = 24;

export type TicketChipState = "live" | "closed" | "shattered";

export type TicketFieldProps = {
  entries: readonly TicketTapeEntry[];
  /** Player wallet (lowercase) for YOU highlight. */
  playerAddress: string | null;
  frozen?: boolean;
  /** Per-ticket visual state during replay (ticketId → state). */
  chipStates?: ReadonlyMap<string, TicketChipState>;
};

type ChipOrbit = {
  ticketId: string;
  radius: number;
  speed: number;
  phase: number;
  height: number;
  entry: TicketTapeEntry;
  isYou: boolean;
};

function hashOrbit(ticketId: string): number {
  let h = 0;
  for (let i = 0; i < ticketId.length; i++) {
    h = (h * 31 + ticketId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Floating Ticket chips from the live tape. Caps at MAX_CHIPS (newest kept).
 * Motion runs in useFrame; React only re-renders when the entry set changes.
 */
export function TicketField({
  entries,
  playerAddress,
  frozen = false,
  chipStates,
}: TicketFieldProps) {
  const groupRef = useRef<Group>(null);

  const chips = useMemo((): ChipOrbit[] => {
    const slice = entries.slice(-MAX_CHIPS);
    return slice.map((entry, index) => {
      const id = entry.ticketId.toString();
      const h = hashOrbit(id);
      return {
        ticketId: id,
        // Tighter orbits fill the center vacated by the retired giant numerals.
        radius: 1.55 + (h % 100) / 110 + (index % 5) * 0.12,
        speed: 0.14 + (h % 50) / 380,
        phase: (h % 360) * (Math.PI / 180),
        height: ((h % 70) - 35) / 45 + 0.15,
        entry,
        isYou:
          playerAddress !== null &&
          entry.player.toLowerCase() === playerAddress.toLowerCase(),
      };
    });
  }, [entries, playerAddress]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || frozen) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      const chip = chips[i];
      if (!chip || !child) continue;
      const state = chipStates?.get(chip.ticketId) ?? "live";
      if (state === "shattered") {
        child.visible = false;
        continue;
      }
      child.visible = true;
      const angle = chip.phase + t * chip.speed;
      child.position.x = Math.cos(angle) * chip.radius;
      child.position.z = Math.sin(angle) * chip.radius;
      child.position.y = chip.height + Math.sin(t * 1.4 + chip.phase) * 0.12;
      child.rotation.y = -angle + Math.PI / 2;
      if (state === "closed") {
        child.scale.setScalar(0.92);
      }
    }
  });

  return (
    <group ref={groupRef}>
      {chips.map((chip) => {
        const state = chipStates?.get(chip.ticketId) ?? "live";
        if (state === "shattered") return null;
        const color =
          state === "closed" ? "#92f5b8" : chip.isYou ? "#d6a660" : "#7ec8ff";
        const label = chip.isYou
          ? `YOU ${formatDeskDollarsAmount(chip.entry.margin)} ${formatLeverageBps(chip.entry.leverageBps)}`
          : `${formatDeskDollarsAmount(chip.entry.margin)} ${formatLeverageBps(chip.entry.leverageBps)} ${formatShortAddress(chip.entry.player)}`;

        return (
          <group key={chip.ticketId} scale={chip.isYou ? 1.12 : 1}>
            <mesh>
              <boxGeometry args={[1.35, 0.38, 0.08]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={chip.isYou ? 0.75 : 0.28}
                metalness={0.2}
                roughness={0.45}
              />
            </mesh>
            {chip.isYou ? (
              <pointLight
                color="#d6a660"
                distance={2.4}
                intensity={0.85}
                position={[0, 0.2, 0.4]}
              />
            ) : null}
            <Text
              anchorX="center"
              anchorY="middle"
              color="#090b10"
              fontSize={0.14}
              maxWidth={1.2}
              position={[0, 0, 0.05]}
            >
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
