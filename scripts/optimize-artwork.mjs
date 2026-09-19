#!/usr/bin/env node
/**
 * Shrink committed crayon PNGs in place (NFT stage art, ticker logos, and
 * docs illustrations).
 *
 * Run with `pnpm optimize:artwork`.
 *
 * Public paths stay put: issue #461 serves the NFT files as static HTTPS
 * `image` URLs, and docs illustrations are served from the same `/docs/…`
 * paths after deploy, so this script only ever rewrites bytes — never names,
 * directories, or formats.
 *
 * Re-running is safe. A file already paletted and at or below its target
 * edge is left untouched, so the lossy encode is never stacked on itself.
 */
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
/** PNG IHDR color type 3 is indexed (palette). Byte 25 of a valid PNG. */
const PNG_COLOR_TYPE_INDEXED = 3;

function isIndexedPng(bytes) {
  return (
    bytes.length >= 26 &&
    bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
    bytes[25] === PNG_COLOR_TYPE_INDEXED
  );
}

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const TICKERS = ["aapl", "nvda", "googl", "meta"];
const STAGES = ["healthy", "warning", "danger", "liquidated", "closed"];

/** Stage art is the primary NFT image; logos are the pricing-unavailable fallback. */
export const STAGE_MAX_EDGE = 1024;
export const LOGO_MAX_EDGE = 896;
/** Docs illustrations are already near display size; this only caps huge drops. */
export const DOCS_MAX_EDGE = 1600;

/** NFT files this script is allowed to touch, with their target edge. */
export const ARTWORK_TARGETS = [
  ...TICKERS.flatMap((ticker) =>
    STAGES.map((stage) => ({
      file: `public/${ticker}/${stage}.png`,
      maxEdge: STAGE_MAX_EDGE,
    }))
  ),
  ...TICKERS.map((ticker) => ({
    file: `public/logos/${ticker}.png`,
    maxEdge: LOGO_MAX_EDGE,
  })),
];

/** Docs illustrations this script is allowed to touch. */
export const DOCS_TARGETS = [
  "public/docs/docs-hero-puppy-books.png",
  "public/docs/docs-page-reference.png",
  "public/docs/leverage-flow.png",
  "public/docs/position-nft-card.png",
  "public/docs/position-nft-signpost.png",
  "public/docs/step-borrow-usdc.png",
  "public/docs/step-deposit-stock.png",
  "public/docs/step-more-same-stock.png",
].map((file) => ({ file, maxEdge: DOCS_MAX_EDGE }));

const ALL_TARGETS = [...ARTWORK_TARGETS, ...DOCS_TARGETS];

/**
 * `palette` is the whole win on this crayon artwork: it takes a 1254px stage
 * image from ~3 MB to ~750 KB, where a plain re-encode only saves ~25%.
 * libvips ignores `colours`, so every encode lands a full 256-entry palette.
 */
const PNG_OPTIONS = { palette: true, effort: 10, compressionLevel: 9 };

/**
 * Re-encode one PNG in place. Oversized files are downscaled to fit
 * `maxEdge`; truecolor files already inside the edge are paletted in place.
 *
 * @param {string} filePath absolute path to the PNG
 * @param {number} maxEdge longest allowed edge in pixels
 * @returns {Promise<{status: "skipped" | "replaced" | "unchanged", before: number, after: number, width: number, height: number}>}
 */
export async function optimizeFile(filePath, maxEdge) {
  const sourceBytes = await readFile(filePath);
  const before = sourceBytes.length;
  const source = sharp(sourceBytes);
  const { width, height } = await source.metadata();
  const needsResize = width > maxEdge || height > maxEdge;

  if (!needsResize && isIndexedPng(sourceBytes)) {
    return { status: "skipped", before, after: before, width, height };
  }

  const pipeline = needsResize
    ? source.resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
    : source;

  const { data, info } = await pipeline
    .png(PNG_OPTIONS)
    .toBuffer({ resolveWithObject: true });

  if (data.length >= before) {
    return { status: "unchanged", before, after: before, width, height };
  }

  const tmpPath = `${filePath}.tmp`;
  try {
    await writeFile(tmpPath, data);
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }

  return {
    status: "replaced",
    before,
    after: data.length,
    width: info.width,
    height: info.height,
  };
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function findMissing() {
  const missing = [];
  for (const { file } of ALL_TARGETS) {
    try {
      await stat(path.join(REPO_ROOT, file));
    } catch {
      missing.push(file);
    }
  }
  return missing;
}

async function main() {
  const missing = await findMissing();
  if (missing.length > 0) {
    console.error(
      "\n✗ Expected artwork is missing:\n" +
        missing.map((file) => `    ${file}`).join("\n") +
        "\n\nRestore the files or update the target lists before optimizing.\n"
    );
    process.exit(1);
  }

  let before = 0;
  let after = 0;
  for (const { file, maxEdge } of ALL_TARGETS) {
    const result = await optimizeFile(path.join(REPO_ROOT, file), maxEdge);
    before += result.before;
    after += result.after;
    console.log(
      `${result.status.padEnd(9)} ${file.padEnd(40)} ` +
        `${formatKb(result.before).padStart(8)} -> ${formatKb(result.after).padStart(8)}` +
        `  ${result.width}x${result.height}`
    );
  }

  const saved =
    before === 0 ? 0 : Math.round(((before - after) / before) * 100);
  console.log(
    `\n✓ ${ALL_TARGETS.length} files: ${formatKb(before)} -> ${formatKb(after)} (${saved}% smaller).`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
