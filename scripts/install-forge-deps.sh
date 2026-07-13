#!/usr/bin/env bash
# Install Foundry libs from contracts/foundry.deps.json (single source of truth).
# Usage: pnpm install:forge-deps  |  bash scripts/install-forge-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/contracts/foundry.deps.json"
CONTRACTS="$ROOT/contracts"
LIB_DIR="$CONTRACTS/lib"

if ! command -v forge >/dev/null 2>&1; then
  echo "error: forge not found; install Foundry first (https://book.getfoundry.sh/getting-started/installation)" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: missing $MANIFEST" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 required to parse foundry.deps.json" >&2
  exit 1
fi

mkdir -p "$LIB_DIR"
cd "$CONTRACTS"
count=0
while IFS=$'\t' read -r name dep; do
  [[ -z "$name" || -z "$dep" ]] && continue
  # Replace any prior checkout so local + CI always match the manifest tag.
  rm -rf "$LIB_DIR/$name"
  # --no-git installs as plain dirs (not submodules), keeping deps out of the
  # repo's submodule machinery so install is reproducible from the manifest.
  forge install "$dep" --no-git
  count=$((count + 1))
done < <(
  python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
for name, entry in data.items():
    print("%s\t%s@%s" % (name, entry["repo"], entry["tag"]))
' "$MANIFEST"
)

echo "Installed ${count} forge dependencies from foundry.deps.json"
