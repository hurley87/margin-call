"use client";

import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  type Mesh,
  Vector3,
} from "three";
import {
  formatCrashPointBps,
  formatLeverageBps,
  ENTRY_LEVERAGE_TIERS_BPS,
} from "@/lib/margin-call-crash";
import {
  getReplayMultiplierBps,
  getReplayPathPoints,
  getTierCloseProgress,
  isReplayComplete,
} from "@/lib/round-replay";

const PATH_W = 10;
const PATH_H = 5;

export type ReplaySceneProps = {
  crashPointBps: bigint;
  progress: number;
  playerTierBps: bigint | null;
};

/**
 * 3D ribbon climb from 1.00x to the verified Crash Point. Uses the same
 * deterministic path math as the SVG ReplayCurve.
 */
export function ReplayScene({
  crashPointBps,
  progress,
  playerTierBps,
}: ReplaySceneProps) {
  const headRef = useRef<Mesh>(null);
  const ribbonRef = useRef<Group>(null);
  const complete = isReplayComplete(progress);
  const multiplierBps = getReplayMultiplierBps(progress, crashPointBps);
  const display = formatCrashPointBps(multiplierBps);
  const crashLabel = formatCrashPointBps(crashPointBps);

  const { positions, head } = useMemo(() => {
    const points = getReplayPathPoints(
      crashPointBps,
      Math.max(progress, 0.02),
      {
        width: PATH_W,
        height: PATH_H,
        samples: 80,
      }
    );
    // Map SVG coords (y down from top) into 3D: x centered, y up.
    const vectors = points.map(
      (p) => new Vector3(p.x - PATH_W / 2, (PATH_H - p.y) * 0.55 - 0.4, 0)
    );
    const last = vectors[vectors.length - 1] ?? new Vector3(0, -0.4, 0);
    return { positions: vectors, head: last };
  }, [crashPointBps, progress]);

  const ribbonGeometry = useMemo(() => {
    if (positions.length < 2) return null;
    const curve = new CatmullRomCurve3(positions);
    const tube = new BufferGeometry();
    const segs = Math.max(8, positions.length * 2);
    const pts = curve.getPoints(segs);
    const verts: number[] = [];
    const half = 0.08;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      // Simple ribbon quads in the XY plane with slight Z thickness.
      verts.push(
        a.x,
        a.y - half,
        0.02,
        a.x,
        a.y + half,
        0.02,
        b.x,
        b.y + half,
        0.02,
        a.x,
        a.y - half,
        0.02,
        b.x,
        b.y + half,
        0.02,
        b.x,
        b.y - half,
        0.02
      );
    }
    tube.setAttribute("position", new Float32BufferAttribute(verts, 3));
    tube.computeVertexNormals();
    return tube;
  }, [positions]);

  const tierMarkers = useMemo(
    () =>
      ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
        const closeAt = getTierCloseProgress(tier, crashPointBps);
        if (closeAt === null) return [];
        const pts = getReplayPathPoints(crashPointBps, closeAt, {
          width: PATH_W,
          height: PATH_H,
          samples: 24,
        });
        const p = pts[pts.length - 1];
        if (!p) return [];
        return [
          {
            tier,
            closeAt,
            position: new Vector3(
              p.x - PATH_W / 2,
              (PATH_H - p.y) * 0.55 - 0.4,
              0
            ),
            isPlayer: playerTierBps !== null && tier === playerTierBps,
            closed: closeAt <= progress,
          },
        ];
      }),
    [crashPointBps, playerTierBps, progress]
  );

  useFrame(({ clock }) => {
    const mesh = headRef.current;
    if (!mesh) return;
    mesh.position.copy(head);
    if (!complete) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 8) * 0.15;
      mesh.scale.setScalar(s);
    } else {
      mesh.scale.setScalar(1.4);
    }
  });

  const headColor = complete ? "#ff6b5c" : "#92f5b8";

  return (
    <group ref={ribbonRef} position={[0, 0.2, 0]}>
      {ribbonGeometry ? (
        <mesh geometry={ribbonGeometry}>
          <meshStandardMaterial
            color="#92f5b8"
            emissive="#92f5b8"
            emissiveIntensity={0.45}
            metalness={0.1}
            roughness={0.35}
            side={DoubleSide}
          />
        </mesh>
      ) : null}

      <mesh ref={headRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial
          color={headColor}
          emissive={headColor}
          emissiveIntensity={0.8}
        />
      </mesh>

      <Text
        anchorX="center"
        anchorY="bottom"
        color={headColor}
        fontSize={0.55}
        outlineColor="#090b10"
        outlineWidth={0.02}
        position={[head.x, head.y + 0.45, 0.2]}
      >
        {complete ? crashLabel : display}
      </Text>

      {tierMarkers.map((marker) => (
        <group key={marker.tier.toString()} position={marker.position}>
          <mesh>
            <boxGeometry args={[0.55, 0.08, 0.04]} />
            <meshStandardMaterial
              color={
                marker.closed
                  ? "#92f5b8"
                  : marker.isPlayer
                    ? "#d6a660"
                    : "#5a6478"
              }
              emissive={marker.closed ? "#92f5b8" : "#000000"}
              emissiveIntensity={marker.closed ? 0.4 : 0}
            />
          </mesh>
          <Text
            anchorX="left"
            anchorY="middle"
            color={marker.isPlayer ? "#d6a660" : "#9aa3b5"}
            fontSize={0.12}
            position={[0.35, 0, 0.05]}
          >
            {formatLeverageBps(marker.tier)}
          </Text>
        </group>
      ))}
    </group>
  );
}
