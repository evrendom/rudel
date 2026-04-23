#!/usr/bin/env bash
# Retry remaining 13 failed chunks: drop QUALIFY (ReplacingMergeTree handles dedup),
# use max_threads=1, and reduce block size.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-claude-retry2.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MV_QUERY=$(cat "$SCRIPT_DIR/claude_mv_rewritten.sql")

DAYS=(
  "2026-03-17 2026-03-18"
  "2026-03-18 2026-03-19"
  "2026-03-20 2026-03-21"
  "2026-03-21 2026-03-22"
  "2026-03-23 2026-03-24"
  "2026-03-26 2026-03-27"
  "2026-03-30 2026-03-31"
  "2026-03-31 2026-04-01"
  "2026-04-08 2026-04-09"
  "2026-04-09 2026-04-10"
  "2026-04-10 2026-04-11"
  "2026-04-15 2026-04-16"
  "2026-04-16 2026-04-17"
)

TOTAL=${#DAYS[@]}
DONE=0
FAILED=0
FAILED_WINDOWS=()

echo "Retrying $TOTAL chunks: no QUALIFY, max_threads=1"
echo ""

for window in "${DAYS[@]}"; do
  FROM=$(echo "$window" | cut -d' ' -f1)
  TO=$(echo "$window" | cut -d' ' -f2)

  # No QUALIFY — ReplacingMergeTree(ingested_at) deduplicates naturally
  SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
SETTINGS async_insert=0, max_threads=1"

  echo -n "[$(date +%H:%M:%S)] ${FROM} → ${TO} ... "
  if chcli -q "$SQL" 2>&1; then
    DONE=$((DONE + 1))
    echo "✓ ($DONE/$TOTAL)"
  else
    FAILED=$((FAILED + 1))
    FAILED_WINDOWS+=("$FROM → $TO")
    echo "✗ FAILED"
  fi
done

echo ""
echo "Retry complete: $DONE succeeded, $FAILED failed out of $TOTAL chunks."
if [ ${#FAILED_WINDOWS[@]} -gt 0 ]; then
  echo ""
  echo "Still failing:"
  for w in "${FAILED_WINDOWS[@]}"; do
    echo "  - $w"
  done
fi
