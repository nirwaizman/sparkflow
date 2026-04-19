#!/usr/bin/env bash
# =============================================================================
# infra/vercel/secrets.sh
# -----------------------------------------------------------------------------
# Push SparkFlow production environment variables into Vercel.
#
# Prerequisites:
#   - `vercel` CLI v34+ installed and authenticated (`vercel login`).
#   - Current directory linked to the project: `vercel link --project sparkflow-web`.
#   - A local `.env.production` file populated from infra/vercel/env.example.
#     (The example file lists every variable and where to source it from.)
#
# Usage:
#   ENV_FILE=.env.production ./infra/vercel/secrets.sh           # push all
#   ENV_FILE=.env.production ./infra/vercel/secrets.sh NAME_ONLY # single var
#   DRY_RUN=1 ./infra/vercel/secrets.sh                          # show plan
#
# Notes / stubs:
#   - This script is a thin wrapper around `vercel env add` / `vercel env rm`.
#   - `vercel env add` reads the value from stdin so nothing is ever in argv
#     (which would leak into shell history / ps output).
#   - For anything whose name starts with NEXT_PUBLIC_ the value will be
#     embedded in the client bundle — do NOT store real secrets under that
#     prefix (see env.example for `secret=yes/no` annotations).
#   - Run it once per environment (production, preview). Re-running replaces.
# =============================================================================

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
VERCEL_ENV="${VERCEL_ENV:-production}"   # production | preview | development
ONLY="${1:-}"                            # optional: only push this var name
DRY_RUN="${DRY_RUN:-0}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found. Copy infra/vercel/env.example and fill it." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "error: vercel CLI not installed. Run: npm i -g vercel" >&2
  exit 1
fi

if [[ ! -f ".vercel/project.json" ]]; then
  echo "error: project not linked. Run: vercel link --project sparkflow-web" >&2
  exit 1
fi

push_var() {
  local name="$1"
  local value="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] vercel env add $name $VERCEL_ENV  (len=${#value})"
    return 0
  fi

  # Remove existing value silently (ignore "not found") to make script idempotent.
  vercel env rm "$name" "$VERCEL_ENV" --yes >/dev/null 2>&1 || true

  # Pipe via stdin so the secret never lands in shell history.
  printf '%s' "$value" | vercel env add "$name" "$VERCEL_ENV" >/dev/null
  echo "  pushed: $name"
}

echo "Pushing env vars from $ENV_FILE → Vercel ($VERCEL_ENV)"

# Parse KEY=VALUE ignoring comments and blank lines.
# Handles values that contain '=' (splits only on the first '=').
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  key="${line%%=*}"
  val="${line#*=}"
  key="${key// /}"

  # Strip surrounding single or double quotes if present.
  if [[ "$val" =~ ^\".*\"$ ]]; then val="${val:1:${#val}-2}"; fi
  if [[ "$val" =~ ^\'.*\'$ ]]; then val="${val:1:${#val}-2}"; fi

  # Skip placeholder values (common pattern: starts with "<" or is empty).
  [[ -z "$val" ]] && { echo "  skip (empty): $key"; continue; }
  [[ "$val" == \<*\> ]] && { echo "  skip (placeholder): $key"; continue; }

  if [[ -n "$ONLY" && "$ONLY" != "$key" ]]; then
    continue
  fi

  push_var "$key" "$val"
done < "$ENV_FILE"

echo "Done."
echo
echo "Verify with: vercel env ls $VERCEL_ENV"
