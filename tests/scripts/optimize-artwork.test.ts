import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARTWORK_TARGETS,
  DOCS_MAX_EDGE,
  DOCS_TARGETS,
  LOGO_MAX_EDGE,
  STAGE_MAX_EDGE,
  optimizeFile,
} from "../../scripts/optimize-artwork.mjs";

/**
 * optimizeFile is edge-agnostic, so the behaviour tests use a small edge.
 * Encoding at the real 1024px costs seconds per case at `effort: 10`.
 */
const EDGE = 128;
const OVERSIZED = 160;

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "optimize-artwork-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** A square gradient PNG, which always re-encodes smaller. */
async function writeGradient(name: string, size: number): Promise<string> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      pixels[i] = (x * 255) / size;
      pixels[i + 1] = (y * 255) / size;
      pixels[i + 2] = ((x + y) * 255) / (2 * size);
    }
  }
  return writePng(name, pixels, size);
}

async function writePng(
  name: string,
  pixels: Buffer,
  size: number
): Promise<string> {
  const filePath = path.join(workDir, name);
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(filePath);
  return filePath;
}

describe("ARTWORK_TARGETS", () => {
  it("covers exactly the 16 stage images and 4 ticker logos", () => {
    expect(ARTWORK_TARGETS.map((target) => target.file)).toEqual([
      "public/aapl/healthy.png",
      "public/aapl/warning.png",
      "public/aapl/danger.png",
      "public/aapl/liquidated.png",
      "public/nvda/healthy.png",
      "public/nvda/warning.png",
      "public/nvda/danger.png",
      "public/nvda/liquidated.png",
      "public/googl/healthy.png",
      "public/googl/warning.png",
      "public/googl/danger.png",
      "public/googl/liquidated.png",
      "public/meta/healthy.png",
      "public/meta/warning.png",
      "public/meta/danger.png",
      "public/meta/liquidated.png",
      "public/logos/aapl.png",
      "public/logos/nvda.png",
      "public/logos/googl.png",
      "public/logos/meta.png",
    ]);
  });

  it("targets one edge for stage art and a smaller one for logos", () => {
    const edgeFor = (file: string) =>
      ARTWORK_TARGETS.find((target) => target.file === file)?.maxEdge;

    expect(edgeFor("public/nvda/healthy.png")).toBe(STAGE_MAX_EDGE);
    expect(edgeFor("public/meta/liquidated.png")).toBe(STAGE_MAX_EDGE);
    expect(edgeFor("public/logos/nvda.png")).toBe(LOGO_MAX_EDGE);
    expect(LOGO_MAX_EDGE).toBeLessThan(STAGE_MAX_EDGE);
  });
});

describe("DOCS_TARGETS", () => {
  it("covers exactly the eight public/docs illustrations", () => {
    expect(DOCS_TARGETS.map((target) => target.file)).toEqual([
      "public/docs/docs-hero-puppy-books.png",
      "public/docs/docs-page-reference.png",
      "public/docs/leverage-flow.png",
      "public/docs/position-nft-card.png",
      "public/docs/position-nft-signpost.png",
      "public/docs/step-borrow-usdc.png",
      "public/docs/step-deposit-stock.png",
      "public/docs/step-more-same-stock.png",
    ]);
  });

  it("keeps docs illustrations at a larger edge than NFT stage art", () => {
    expect(DOCS_MAX_EDGE).toBeGreaterThan(STAGE_MAX_EDGE);
    expect(
      DOCS_TARGETS.every((target) => target.maxEdge === DOCS_MAX_EDGE)
    ).toBe(true);
  });
});

describe("optimizeFile", () => {
  it("downscales an oversized image to the target edge, still square PNG", async () => {
    const filePath = await writeGradient("oversized.png", OVERSIZED);
    const before = (await readFile(filePath)).byteLength;

    const result = await optimizeFile(filePath, EDGE);

    expect(result.status).toBe("replaced");
    expect(result.after).toBeLessThan(before);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(EDGE);
    expect(metadata.height).toBe(EDGE);
  });

  it("palettes an already-small truecolor PNG without changing its pixel size", async () => {
    const filePath = await writeGradient("small.png", EDGE);
    const before = (await readFile(filePath)).byteLength;

    const result = await optimizeFile(filePath, EDGE);

    expect(result.status).toBe("replaced");
    expect(result.after).toBeLessThan(before);
    expect(result.width).toBe(EDGE);
    expect(result.height).toBe(EDGE);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(EDGE);
    expect(metadata.height).toBe(EDGE);
  });

  it("leaves an already-small paletted PNG byte-identical", async () => {
    const filePath = await writeGradient("already-paletted.png", EDGE);
    await optimizeFile(filePath, EDGE);
    const original = await readFile(filePath);

    const result = await optimizeFile(filePath, EDGE);

    expect(result.status).toBe("skipped");
    expect(await readFile(filePath)).toEqual(original);
  });

  it("is idempotent: a second run skips the file it just wrote", async () => {
    const filePath = await writeGradient("twice.png", OVERSIZED);

    const first = await optimizeFile(filePath, EDGE);
    const optimized = await readFile(filePath);
    const second = await optimizeFile(filePath, EDGE);

    expect(first.status).toBe("replaced");
    expect(second.status).toBe("skipped");
    expect(await readFile(filePath)).toEqual(optimized);
  });

  it("keeps the original when the re-encode would be larger", async () => {
    // A strictly periodic pattern costs almost nothing to store, because PNG
    // filters predict it exactly. Downscaling by a non-integer ratio aliases
    // the periodicity into noise that no longer compresses, so the re-encode
    // comes out bigger than the source it would replace.
    const pixels = Buffer.alloc(OVERSIZED * OVERSIZED * 3);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (i * 2654435761) % 256;
    }
    const filePath = await writePng("periodic.png", pixels, OVERSIZED);
    const original = await readFile(filePath);

    const result = await optimizeFile(filePath, EDGE);

    expect(result.status).toBe("unchanged");
    expect(result.after).toBe(result.before);
    expect(await readFile(filePath)).toEqual(original);
  });

  it("does not leave a temp file behind", async () => {
    const filePath = await writeGradient("tidy.png", OVERSIZED);

    await optimizeFile(filePath, EDGE);

    await expect(readFile(`${filePath}.tmp`)).rejects.toThrow();
  });

  it("rejects when the file does not exist", async () => {
    await expect(
      optimizeFile(path.join(workDir, "missing.png"), EDGE)
    ).rejects.toThrow();
  });
});

describe("optimizeFile write safety", () => {
  it("does not touch sibling files in the same directory", async () => {
    const target = await writeGradient("target.png", OVERSIZED);
    const sibling = path.join(workDir, "sibling.png");
    await writeFile(sibling, await readFile(target));
    const siblingBefore = await readFile(sibling);

    await optimizeFile(target, EDGE);

    expect(await readFile(sibling)).toEqual(siblingBefore);
  });
});
