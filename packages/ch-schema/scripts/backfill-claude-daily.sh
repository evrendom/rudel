#!/usr/bin/env bash
# Retry backfill for Feb 1 – Apr 22, 2026 using DAILY chunks.
# The monthly/weekly chunks OOM on ClickHouse Cloud (4.8 GiB cap)
# because splitByChar('\n', content) on large sessions blows memory.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-claude-daily.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MV_QUERY=$(cat "$SCRIPT_DIR/claude_mv_rewritten.sql")

# Generate daily windows from 2026-02-01 to 2026-04-23 (covers through Apr 22)
DAYS=()
START="2026-02-01"
END="2026-04-23"

current="$START"
while [[ "$current" < "$END" ]]; do
  next=$(date -d "$current + 1 day" +%Y-%m-%d 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d)
  DAYS+=("$current $next")
  current="$next"
done

TOTAL=${#DAYS[@]}
DONE=0
FAILED=0
FAILED_WINDOWS=()

echo "Starting daily backfill: $TOTAL chunks from $START to $END"
echo ""

for window in "${DAYS[@]}"; do
  FROM=$(echo "$window" | cut -d' ' -f1)
  TO=$(echo "$window" | cut -d' ' -f2)

  SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"

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
echo "Backfill complete: $DONE succeeded, $FAILED failed out of $TOTAL chunks."
if [ ${#FAILED_WINDOWS[@]} -gt 0 ]; then
  echo ""
  echo "Failed windows:"
  for w in "${FAILED_WINDOWS[@]}"; do
    echo "  - $w"
  done
fi
