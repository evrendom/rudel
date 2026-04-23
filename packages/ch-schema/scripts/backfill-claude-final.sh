#!/usr/bin/env bash
# Final backfill: uses now64(3) as ingested_at so new rows win ReplacingMergeTree dedup.
# Two passes: first daily chunks with default threads, then retry failures with max_threads=1.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-claude-final.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MV_QUERY=$(cat "$SCRIPT_DIR/claude_mv_rewritten.sql")

# Generate daily windows from 2026-02-01 to 2026-04-23
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

echo "=== Pass 1: Daily chunks (default threads) ==="
echo ""

for window in "${DAYS[@]}"; do
  FROM=$(echo "$window" | cut -d' ' -f1)
  TO=$(echo "$window" | cut -d' ' -f2)

  SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
SETTINGS async_insert=0"

  echo -n "[$(date +%H:%M:%S)] ${FROM} → ${TO} ... "
  if chcli -q "$SQL" 2>&1; then
    DONE=$((DONE + 1))
    echo "✓ ($DONE/$TOTAL)"
  else
    FAILED=$((FAILED + 1))
    FAILED_WINDOWS+=("$FROM $TO")
    echo "✗"
  fi
done

echo ""
echo "Pass 1: $DONE succeeded, $FAILED failed out of $TOTAL"

# Pass 2: retry with max_threads=1, no QUALIFY
if [ ${#FAILED_WINDOWS[@]} -gt 0 ]; then
  echo ""
  echo "=== Pass 2: Retry ${#FAILED_WINDOWS[@]} failures (max_threads=1) ==="
  RETRY_DONE=0
  RETRY_FAILED=0
  STILL_FAILING=()

  for window in "${FAILED_WINDOWS[@]}"; do
    FROM=$(echo "$window" | cut -d' ' -f1)
    TO=$(echo "$window" | cut -d' ' -f2)

    SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
SETTINGS async_insert=0, max_threads=1"

    echo -n "[$(date +%H:%M:%S)] ${FROM} → ${TO} ... "
    if chcli -q "$SQL" 2>&1; then
      RETRY_DONE=$((RETRY_DONE + 1))
      echo "✓"
    else
      RETRY_FAILED=$((RETRY_FAILED + 1))
      STILL_FAILING+=("$FROM $TO")
      echo "✗"
    fi
  done

  echo ""
  echo "Pass 2: $RETRY_DONE recovered, $RETRY_FAILED still failing"

  # Pass 3: 12-hour windows for anything still failing
  if [ ${#STILL_FAILING[@]} -gt 0 ]; then
    echo ""
    echo "=== Pass 3: 12-hour windows for ${#STILL_FAILING[@]} remaining ==="
    PASS3_DONE=0
    PASS3_FAILED=0
    FINAL_FAILURES=()

    for window in "${STILL_FAILING[@]}"; do
      FROM=$(echo "$window" | cut -d' ' -f1)
      TO=$(echo "$window" | cut -d' ' -f2)

      for HALF in "00:00:00.000Z 12:00:00.000Z" "12:00:00.000Z 00:00:00.000Z"; do
        H_FROM="${FROM}T$(echo "$HALF" | cut -d' ' -f1)"
        H_TO_TIME=$(echo "$HALF" | cut -d' ' -f2)
        if [ "$H_TO_TIME" = "00:00:00.000Z" ]; then
          H_TO="${TO}T${H_TO_TIME}"
        else
          H_TO="${FROM}T${H_TO_TIME}"
        fi

        SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${H_FROM}')
  AND session_date < parseDateTimeBestEffort('${H_TO}')
SETTINGS async_insert=0, max_threads=1"

        echo -n "[$(date +%H:%M:%S)] ${H_FROM} → ${H_TO} ... "
        if chcli -q "$SQL" 2>&1; then
          PASS3_DONE=$((PASS3_DONE + 1))
          echo "✓"
        else
          PASS3_FAILED=$((PASS3_FAILED + 1))
          FINAL_FAILURES+=("$H_FROM → $H_TO")
          echo "✗"
        fi
      done
    done

    echo ""
    echo "Pass 3: $PASS3_DONE recovered, $PASS3_FAILED still failing"
    if [ ${#FINAL_FAILURES[@]} -gt 0 ]; then
      echo ""
      echo "Final failures:"
      for w in "${FINAL_FAILURES[@]}"; do
        echo "  - $w"
      done
    fi
  fi
fi

echo ""
echo "=== DONE ==="
