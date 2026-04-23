#!/usr/bin/env bash
# Retry failed daily chunks with max_threads=1 to reduce peak memory.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-claude-retry.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MV_QUERY=$(cat "$SCRIPT_DIR/claude_mv_rewritten.sql")

# These are the 22 daily windows that failed with default thread count
DAYS=(
  "2026-03-12 2026-03-13"
  "2026-03-17 2026-03-18"
  "2026-03-18 2026-03-19"
  "2026-03-19 2026-03-20"
  "2026-03-20 2026-03-21"
  "2026-03-21 2026-03-22"
  "2026-03-23 2026-03-24"
  "2026-03-25 2026-03-26"
  "2026-03-26 2026-03-27"
  "2026-03-30 2026-03-31"
  "2026-03-31 2026-04-01"
  "2026-04-01 2026-04-02"
  "2026-04-06 2026-04-07"
  "2026-04-08 2026-04-09"
  "2026-04-09 2026-04-10"
  "2026-04-10 2026-04-11"
  "2026-04-13 2026-04-14"
  "2026-04-15 2026-04-16"
  "2026-04-16 2026-04-17"
  "2026-04-17 2026-04-18"
  "2026-04-20 2026-04-21"
  "2026-04-21 2026-04-22"
)

TOTAL=${#DAYS[@]}
DONE=0
FAILED=0
FAILED_WINDOWS=()

echo "Retrying $TOTAL failed chunks with max_threads=1"
echo ""

for window in "${DAYS[@]}"; do
  FROM=$(echo "$window" | cut -d' ' -f1)
  TO=$(echo "$window" | cut -d' ' -f2)

  SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.session_id ORDER BY cs.ingested_at DESC) = 1
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
