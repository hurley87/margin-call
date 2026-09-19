import Image from "next/image";
import { cn } from "@/lib/utils";

/** Committed stage art is square; this is the largest size any surface renders. */
const ARTWORK_PIXELS = 512;

type PositionArtworkProps = {
  /** Public path from the artwork resolver, or null for an asset with no art. */
  src: string | null;
  alt: string;
  className?: string;
  sizes?: string;
};

/**
 * The hand-drawn face of a Position NFT.
 *
 * Takes an already-resolved path: galleries unwrap metadata artwork and
 * detail uses the same artwork rule against its existing Base read.
 */
export function PositionArtwork({
  src,
  alt,
  className,
  sizes,
}: PositionArtworkProps) {
  if (src === null) {
    return (
      <div
        aria-hidden
        className={cn(
          "aspect-square border border-dashed border-[var(--t-border)]",
          className
        )}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={ARTWORK_PIXELS}
      height={ARTWORK_PIXELS}
      sizes={sizes}
      className={cn(
        "aspect-square h-auto w-full border border-[var(--t-border)] object-cover",
        className
      )}
    />
  );
}
