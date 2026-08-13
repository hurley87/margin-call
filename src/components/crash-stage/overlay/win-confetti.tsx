"use client";

import { useEffect, useMemo, useState } from "react";

export type WinConfettiProps = {
  /** Remount via key={nonce} to fire again on Replay. */
  nonce: number;
};

type ConfettiPiece = {
  id: number;
  wave: "cannon" | "rain";
  left: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  size: number;
  color: string;
};

const PIECE_COUNT = 160;
const CANNON_COUNT = 70;
const COLORS = [
  "var(--t-green-hot)",
  "var(--t-green)",
  "var(--t-accent)",
  "var(--t-amber-hot)",
  "var(--t-text)",
] as const;

/** Lifetime slightly past the longest piece duration + delay. */
const LAYER_MS = 4_200;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPieces(nonce: number): ConfettiPiece[] {
  const rand = mulberry32(nonce * 9973 + 42);
  const pieces: ConfettiPiece[] = [];

  for (let i = 0; i < PIECE_COUNT; i++) {
    const isCannon = i < CANNON_COUNT;
    pieces.push({
      id: i,
      wave: isCannon ? "cannon" : "rain",
      left: isCannon ? 35 + rand() * 30 : rand() * 100,
      delay: isCannon ? rand() * 0.35 : 0.15 + rand() * 0.9,
      duration: isCannon ? 1.8 + rand() * 1.2 : 2.2 + rand() * 1.4,
      drift: isCannon ? (rand() - 0.5) * 140 : (rand() - 0.5) * 80,
      rotate: 360 + rand() * 720,
      size: isCannon ? 6 + rand() * 8 : 4 + rand() * 7,
      color: COLORS[Math.floor(rand() * COLORS.length)]!,
    });
  }

  return pieces;
}

/**
 * Full-viewport CSS confetti for a personal win. Parent gates reduced motion
 * and remounts via key={nonce} on Replay; this layer only self-unmounts.
 */
export function WinConfetti({ nonce }: WinConfettiProps) {
  const [alive, setAlive] = useState(true);
  const pieces = useMemo(() => buildPieces(nonce), [nonce]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAlive(false), LAYER_MS);
    return () => window.clearTimeout(timer);
  }, [nonce]);

  if (!alive) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-testid="win-confetti"
    >
      {pieces.map((piece) => (
        <span
          className={
            piece.wave === "cannon"
              ? "mc-confetti-cannon absolute bottom-0"
              : "mc-confetti-rain absolute top-0"
          }
          data-testid="win-confetti-piece"
          key={`${nonce}-${piece.id}`}
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * (0.55 + (piece.id % 3) * 0.25),
              backgroundColor: piece.color,
              "--mc-confetti-delay": `${piece.delay}s`,
              "--mc-confetti-duration": `${piece.duration}s`,
              "--mc-confetti-drift": `${piece.drift}px`,
              "--mc-confetti-rotate": `${piece.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export const WIN_CONFETTI_PIECE_COUNT = PIECE_COUNT;
