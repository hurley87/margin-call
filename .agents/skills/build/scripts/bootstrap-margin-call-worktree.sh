#!/usr/bin/env bash
set -euo pipefail

SRC="${MARGIN_CALL_PRIMARY_CHECKOUT:-/Users/davidhurley/Desktop/margin-call}"

usage() {
  cat <<'USAGE'
Usage:
  bootstrap-margin-call-worktree.sh <worktree-path>

Copies local-only runtime files from the primary Margin Call checkout into a
worktree. Existing destination files are left unchanged
unless OVERWRITE=1 is set.

Environment:
  MARGIN_CALL_PRIMARY_CHECKOUT  Source checkout. Defaults to /Users/davidhurley/Desktop/margin-call
  OVERWRITE=1                   Replace destination files if they already exist
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

DST="$1"

if [[ ! -d "$SRC" ]]; then
  echo "Source checkout does not exist: $SRC" >&2
  exit 1
fi

if [[ ! -d "$DST" ]]; then
  echo "Destination worktree does not exist: $DST" >&2
  exit 1
fi

files=(
  ".env.local"
  ".env.development.local"
  ".env.test.local"
  ".env.production.local"
  ".mcp.json"
)

copied=0
skipped=0
missing=0

for file in "${files[@]}"; do
  src_file="$SRC/$file"
  dst_file="$DST/$file"

  if [[ ! -f "$src_file" ]]; then
    ((missing += 1))
    continue
  fi

  if [[ -e "$dst_file" && "${OVERWRITE:-0}" != "1" ]]; then
    echo "skip existing: $dst_file"
    ((skipped += 1))
    continue
  fi

  cp "$src_file" "$dst_file"
  chmod go-rwx "$dst_file" 2>/dev/null || true
  echo "copied: $file"
  ((copied += 1))
done

echo "done: copied=$copied skipped=$skipped missing=$missing"
