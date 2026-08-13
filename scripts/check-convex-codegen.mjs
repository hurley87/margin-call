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

/** Pure helpers under convex/lib/ are not Convex function modules. */
function isAllowedUnwired(mod) {
  return ALLOWED_UNWIRED.has(mod) || mod.startsWith("lib/");
}

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

const modules = new Set(
  listModules(CONVEX_DIR).map((file) =>
    relative(CONVEX_DIR, file).replace(/\.ts$/, "").split(sep).join("/")
  )
);
const expected = [...modules].filter((mod) => !isAllowedUnwired(mod)).sort();
const missing = expected.filter((mod) => !wired.has(mod));
const stale = [...wired].filter((mod) => !modules.has(mod)).sort();

if (missing.length > 0 || stale.length > 0) {
  const details = [
    ...(missing.length > 0
      ? [
          "\n  Modules missing from api.d.ts:\n" +
            missing.map((mod) => `    convex/${mod}.ts`).join("\n"),
        ]
      : []),
    ...(stale.length > 0
      ? [
          "\n  Modules wired in api.d.ts but missing from convex/:\n" +
            stale.map((mod) => `    convex/${mod}.ts`).join("\n"),
        ]
      : []),
  ].join("\n");
  console.error(
    "\n✗ convex/_generated/api.d.ts is stale." +
      details +
      "\n\nRun `npx convex codegen` and commit convex/_generated.\n"
  );
  process.exit(1);
}

console.log(`✓ convex codegen up to date (${wired.size} modules wired).`);
