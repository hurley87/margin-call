#!/usr/bin/env node
/**
 * Guard: every module under convex/ must be wired into
 * convex/_generated/api.d.ts.
 *
 * The committed generated types are what `next build` type-checks against, and
 * `build` does NOT run codegen (backend deploys are separate — see CLAUDE.md).
 * So adding a Convex module without running `npx convex codegen` leaves the
 * generated `internal`/`api` types stale, which crashes the production build
 * (see PR #195). This catches that drift before the build starts, without
 * touching the network or a deployment.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const CONVEX_DIR = "convex";
const API_FILE = join(CONVEX_DIR, "_generated", "api.d.ts");
// Convex omits these config modules from api.d.ts by design.
const ALLOWED_UNWIRED = new Set(["schema", "auth.config"]);

function listModules(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "_generated") continue;
      out.push(...listModules(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const api = readFileSync(API_FILE, "utf8");
const wired = new Set(
  [...api.matchAll(/from "\.\.\/(.+?)\.js"/g)].map((m) => m[1])
);

const missing = [];
for (const file of listModules(CONVEX_DIR)) {
  const mod = relative(CONVEX_DIR, file)
    .replace(/\.ts$/, "")
    .split(sep)
    .join("/");
  if (wired.has(mod) || ALLOWED_UNWIRED.has(mod)) continue;
  missing.push(mod);
}

if (missing.length > 0) {
  console.error(
    "\n✗ convex/_generated is stale — these modules are not wired into api.d.ts:\n" +
      missing.map((m) => `    convex/${m}.ts`).join("\n") +
      "\n\nRun `npx convex codegen` and commit convex/_generated.\n"
  );
  process.exit(1);
}

console.log(`✓ convex codegen up to date (${wired.size} modules wired).`);
