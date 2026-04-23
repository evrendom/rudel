#!/usr/bin/env bash
# Retry failed backfill days with 6-hour chunks (then 3-hour, then 1-hour fallback).
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-retry.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CLAUDE_FAILED=()
CODEX_FAILED=(2026-03-12 2026-03-23 2026-04-01 2026-04-03 2026-04-07 2026-04-08 2026-04-10 2026-04-11 2026-04-12 2026-04-13 2026-04-14)

run_chunk() {
  local MV_QUERY="$1" FROM_TS="$2" TO_TS="$3"
  local SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM_TS}')
  AND session_date < parseDateTimeBestEffort('${TO_TS}')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.organization_id, cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"
  chcli -q "$SQL" 2>&1
}

retry_day() {
  local SOURCE="$1" SQL_FILE="$2" DAY="$3"
  local MV_QUERY
  MV_QUERY=$(cat "$SQL_FILE")
  local NEXT
  NEXT=$(date -d "$DAY + 1 day" +%Y-%m-%d 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$DAY" +%Y-%m-%d)

  # Try 6-hour chunks
  local HOURS=(00 06 12 18)
  local NEXT_HOURS=(06 12 18 00)
  local all_ok=true

  for i in 0 1 2 3; do
    local h="${HOURS[$i]}"
    local nh="${NEXT_HOURS[$i]}"
    local from_day="$DAY"
    local to_day="$DAY"
    if [[ "$nh" == "00" ]]; then to_day="$NEXT"; fi

    local from_ts="${from_day}T${h}:00:00.000Z"
    local to_ts="${to_day}T${nh}:00:00.000Z"

    echo -n "    ${h}:00→${nh}:00 "
    if run_chunk "$MV_QUERY" "$from_ts" "$to_ts"; then
      echo "✓"
    else
      echo "OOM → trying 3h splits..."
      # Split this 6h into two 3h chunks
      local mid_h=$((10#$h + 3))
      local mid_h_fmt=$(printf "%02d" $mid_h)
      local mid_ts="${from_day}T${mid_h_fmt}:00:00.000Z"

      echo -n "      ${h}:00→${mid_h_fmt}:00 "
      if run_chunk "$MV_QUERY" "$from_ts" "$mid_ts"; then
        echo "✓"
      else
        echo "OOM → trying 1h splits..."
        local sub_ok=true
        for sh in $(seq $((10#$h)) $((10#$h + 2))); do
          local sh_fmt=$(printf "%02d" $sh)
          local sh_next_fmt=$(printf "%02d" $((sh + 1)))
          local s_from="${from_day}T${sh_fmt}:00:00.000Z"
          local s_to="${from_day}T${sh_next_fmt}:00:00.000Z"
          echo -n "        ${sh_fmt}:00→${sh_next_fmt}:00 "
          if run_chunk "$MV_QUERY" "$s_from" "$s_to"; then
            echo "✓"
          else
            echo "✗"
            sub_ok=false
          fi
        done
        if ! $sub_ok; then all_ok=false; fi
      fi

      echo -n "      ${mid_h_fmt}:00→${nh}:00 "
      if run_chunk "$MV_QUERY" "$mid_ts" "$to_ts"; then
        echo "✓"
      else
        echo "OOM → trying 1h splits..."
        local sub_ok=true
        for sh in $(seq $mid_h $((10#$h + 5))); do
          local sh_fmt=$(printf "%02d" $sh)
          local sh_next_fmt=$(printf "%02d" $((sh + 1)))
          local s_from_day="$from_day"
          local s_to_day="$from_day"
          # Handle midnight crossing
          if [[ $((sh + 1)) -ge 24 ]]; then
            sh_next_fmt="00"
            s_to_day="$NEXT"
          fi
          local s_from="${s_from_day}T${sh_fmt}:00:00.000Z"
          local s_to="${s_to_day}T${sh_next_fmt}:00:00.000Z"
          echo -n "        ${sh_fmt}:00→${sh_next_fmt}:00 "
          if run_chunk "$MV_QUERY" "$s_from" "$s_to"; then
            echo "✓"
          else
            echo "✗"
            sub_ok=false
          fi
        done
        if ! $sub_ok; then all_ok=false; fi
      fi
    fi
  done

  if $all_ok; then
    echo "  ✓ $SOURCE $DAY recovered"
    return 0
  else
    echo "  ✗ $SOURCE $DAY still has failures"
    return 1
  fi
}

echo "=== Retrying failed claude days (${#CLAUDE_FAILED[@]} days) ==="
CLAUDE_OK=0 CLAUDE_FAIL=0
for day in "${CLAUDE_FAILED[@]}"; do
  echo "  [$(date +%H:%M:%S)] claude $day"
  if retry_day "claude" "$SCRIPT_DIR/claude_mv_rewritten.sql" "$day"; then
    CLAUDE_OK=$((CLAUDE_OK + 1))
  else
    CLAUDE_FAIL=$((CLAUDE_FAIL + 1))
  fi
done
echo "Claude retry: $CLAUDE_OK recovered, $CLAUDE_FAIL still failing"
echo ""

echo "=== Retrying failed codex days (${#CODEX_FAILED[@]} days) ==="
CODEX_OK=0 CODEX_FAIL=0
for day in "${CODEX_FAILED[@]}"; do
  echo "  [$(date +%H:%M:%S)] codex $day"
  if retry_day "codex" "$SCRIPT_DIR/codex_mv_rewritten.sql" "$day"; then
    CODEX_OK=$((CODEX_OK + 1))
  else
    CODEX_FAIL=$((CODEX_FAIL + 1))
  fi
done
echo "Codex retry: $CODEX_OK recovered, $CODEX_FAIL still failing"
