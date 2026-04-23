#!/usr/bin/env bash
# Backfill session_analytics day-by-day for both claude and codex sessions.
# Falls back to 12-hour chunks if a daily chunk OOMs.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-daily.sh [claude|codex|both]

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:-both}"

START="2025-09-01"
END="2026-04-24"

run_backfill() {
  local SOURCE="$1"
  local SQL_FILE="$2"
  local MV_QUERY
  MV_QUERY=$(cat "$SQL_FILE")

  local TOTAL=0 DONE=0 FAILED=0
  local FAILED_WINDOWS=()

  # Count days
  local current="$START"
  while [[ "$current" < "$END" ]]; do
    TOTAL=$((TOTAL + 1))
    current=$(date -d "$current + 1 day" +%Y-%m-%d 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d)
  done

  echo "=== Backfilling $SOURCE: $TOTAL daily chunks from $START to $END ==="
  echo ""

  current="$START"
  local idx=0
  while [[ "$current" < "$END" ]]; do
    local next
    next=$(date -d "$current + 1 day" +%Y-%m-%d 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d)
    idx=$((idx + 1))

    local SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${current}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${next}T00:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.organization_id, cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"

    echo -n "[$(date +%H:%M:%S)] $SOURCE $current → $next ... "
    if chcli -q "$SQL" 2>&1; then
      DONE=$((DONE + 1))
      echo "✓ ($idx/$TOTAL)"
    else
      # Retry with 12-hour chunks
      echo "OOM, splitting into 12h chunks..."
      local half_ok=true

      # First half: 00:00 → 12:00
      local SQL_H1="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${current}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${current}T12:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.organization_id, cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"

      echo -n "[$(date +%H:%M:%S)]   $current 00:00→12:00 ... "
      if chcli -q "$SQL_H1" 2>&1; then
        echo "✓"
      else
        echo "✗ FAILED"
        half_ok=false
      fi

      # Second half: 12:00 → 00:00 next day
      local SQL_H2="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${current}T12:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${next}T00:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.organization_id, cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"

      echo -n "[$(date +%H:%M:%S)]   $current 12:00→00:00 ... "
      if chcli -q "$SQL_H2" 2>&1; then
        echo "✓"
      else
        echo "✗ FAILED"
        half_ok=false
      fi

      if $half_ok; then
        DONE=$((DONE + 1))
        echo "[$(date +%H:%M:%S)]   ✓ recovered via 12h split ($idx/$TOTAL)"
      else
        FAILED=$((FAILED + 1))
        FAILED_WINDOWS+=("$current")
        echo "[$(date +%H:%M:%S)]   ✗ still failing ($idx/$TOTAL)"
      fi
    fi

    current="$next"
  done

  echo ""
  echo "$SOURCE backfill: $DONE succeeded, $FAILED failed out of $TOTAL days."
  if [ ${#FAILED_WINDOWS[@]} -gt 0 ]; then
    echo "Failed days:"
    for w in "${FAILED_WINDOWS[@]}"; do
      echo "  - $w"
    done
  fi
  echo ""
}

if [[ "$MODE" == "claude" || "$MODE" == "both" ]]; then
  run_backfill "claude" "$SCRIPT_DIR/claude_mv_rewritten.sql"
fi

if [[ "$MODE" == "codex" || "$MODE" == "both" ]]; then
  run_backfill "codex" "$SCRIPT_DIR/codex_mv_rewritten.sql"
fi
