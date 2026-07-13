#!/usr/bin/env node
/**
 * Gate full-tree pnpm audit for CI.
 * - Fails on any high/critical not listed in ALLOWED packages below
 *   (mirrors docs/security/dependency-exceptions.md).
 * - Production path should use `pnpm audit:prod` separately (must be clean).
 */
import { execSync } from "node:child_process";

/** Packages with documented exceptions (dev-only / unreachable in prod). */
const ALLOWED_HIGH_OR_CRITICAL = new Set(["vite"]);

function runAuditJson() {
  try {
    const out = execSync("pnpm audit --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (err) {
    // pnpm audit exits non-zero when vulnerabilities exist; stdout still has JSON.
    const stdout =
      err && typeof err === "object" && "stdout" in err ? err.stdout : "";
    if (typeof stdout === "string" && stdout.trim()) {
      return JSON.parse(stdout);
    }
    throw err;
  }
}

const report = runAuditJson();
const vulns = report.vulnerabilities ?? {};
const blockers = [];

for (const [name, info] of Object.entries(vulns)) {
  const severity = info?.severity;
  if (severity !== "high" && severity !== "critical") continue;
  if (ALLOWED_HIGH_OR_CRITICAL.has(name)) continue;
  blockers.push({ name, severity, via: info?.via });
}

if (blockers.length > 0) {
  console.error("Undocumented high/critical advisories:");
  for (const b of blockers) {
    console.error(`  - [${b.severity}] ${b.name}`);
  }
  console.error(
    "Fix with an upgrade/override, or document in docs/security/dependency-exceptions.md and ALLOWED_HIGH_OR_CRITICAL."
  );
  process.exit(1);
}

console.log(
  "audit:all gate OK (no undocumented high/critical; allowed:",
  [...ALLOWED_HIGH_OR_CRITICAL].join(", ") || "(none)",
  ")"
);
