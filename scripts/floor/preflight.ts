/**
 * Offline Floor preflight CLI (#248).
 * Usage: pnpm floor:preflight
 */
import { loadRobinhoodTestnetDependencies } from "./dependencies";
import {
  offlinePreflightHasErrors,
  runOfflinePreflight,
} from "./preflight-checks";

function main() {
  const deps = loadRobinhoodTestnetDependencies();
  const findings = runOfflinePreflight(deps);

  console.log(
    JSON.stringify(
      {
        ok: !offlinePreflightHasErrors(findings),
        chainId: deps.network.chainId,
        dependencyCount: deps.dependencies.length,
        findings,
      },
      null,
      2
    )
  );

  if (offlinePreflightHasErrors(findings)) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Offline preflight failed: ${message}`);
  process.exitCode = 1;
}
