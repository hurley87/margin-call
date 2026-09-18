#!/usr/bin/env node
/**
 * Shrink the committed NFT artwork in place.
 *
 * Run with `pnpm optimize:artwork`.
 *
 * Public paths are load-bearing: issue #461 serves these exact files as the
 * static HTTPS `image` URLs in Position NFT metadata, so this script only ever
 * rewrites bytes — never names, directories, or formats.
 *
 * Re-running is safe. A file already at or below its target edge is left
 * untouched, so the lossy palette encode is never stacked on itself.
 */
import { rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const TICKERS = ["aapl", "nvda", "googl", "meta"];
const STAGES = ["healthy", "warning", "danger", "liquidated"];

/** Stage art is the primary NFT image; logos are the pricing-unavailable fallback. */
export const STAGE_MAX_EDGE = 1024;
export const LOGO_MAX_EDGE = 896;

/** Every file this script is allowed to touch, with its target edge. */
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

/**
 * `palette` is the whole win on this crayon artwork: it takes a 1254px stage
 * image from ~3 MB to ~750 KB, where a plain re-encode only saves ~25%.
 * libvips ignores `colours`, so every encode lands a full 256-entry palette.
 */
const PNG_OPTIONS = { palette: true, effort: 10, compressionLevel: 9 };

/**
 * Re-encode one PNG in place, downscaled to fit `maxEdge` on both sides.
 *
 * @param {string} filePath absolute path to the PNG
 * @param {number} maxEdge longest allowed edge in pixels
 * @returns {Promise<{status: "skipped" | "replaced" | "unchanged", before: number, after: number, width: number, height: number}>}
 */
export async function optimizeFile(filePath, maxEdge) {
  const before = (await stat(filePath)).size;
  const source = sharp(filePath);
  const { width, height } = await source.metadata();

  if (width <= maxEdge && height <= maxEdge) {
    return { status: "skipped", before, after: before, width, height };
  }

  const { data, info } = await source
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
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
  for (const { file } of ARTWORK_TARGETS) {
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
      "\n✗ Expected NFT artwork is missing:\n" +
        missing.map((file) => `    ${file}`).join("\n") +
        "\n\nRestore the files or update ARTWORK_TARGETS before optimizing.\n"
    );
    process.exit(1);
  }

  let before = 0;
  let after = 0;
  for (const { file, maxEdge } of ARTWORK_TARGETS) {
    const result = await optimizeFile(path.join(REPO_ROOT, file), maxEdge);
    before += result.before;
    after += result.after;
    console.log(
      `${result.status.padEnd(9)} ${file.padEnd(28)} ` +
        `${formatKb(result.before).padStart(8)} -> ${formatKb(result.after).padStart(8)}` +
        `  ${result.width}x${result.height}`
    );
  }

  const saved =
    before === 0 ? 0 : Math.round(((before - after) / before) * 100);
  console.log(
    `\n✓ ${ARTWORK_TARGETS.length} files: ${formatKb(before)} -> ${formatKb(after)} (${saved}% smaller).`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
