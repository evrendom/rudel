#!/usr/bin/env bash
# Backfill session_analytics from claude_sessions using the session_analytics_mv query.
# Runs in monthly chunks to avoid overloading ClickHouse.
# Usage: doppler run --project rudel --config prd -- bash scripts/backfill-claude-sessions.sh

set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_URL#https://}"
CLICKHOUSE_USER="${CLICKHOUSE_USERNAME}"
CLICKHOUSE_SECURE=true
CLICKHOUSE_PORT=443
export CLICKHOUSE_HOST CLICKHOUSE_USER CLICKHOUSE_SECURE CLICKHOUSE_PORT CLICKHOUSE_PASSWORD

# Use the rewritten query from the chkit backfill plan (explicit column list, no SELECT *)
# This avoids "Map(String, String) cannot be inside Nullable column" errors.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MV_QUERY=$(cat "$SCRIPT_DIR/claude_mv_rewritten.sql")

MONTHS=(
	"2025-01-01 2025-02-01"
	"2025-02-01 2025-03-01"
	"2025-03-01 2025-04-01"
	"2025-04-01 2025-05-01"
	"2025-05-01 2025-06-01"
	"2025-06-01 2025-07-01"
	"2025-07-01 2025-08-01"
	"2025-08-01 2025-09-01"
	"2025-09-01 2025-10-01"
	"2025-10-01 2025-11-01"
	"2025-11-01 2025-12-01"
	"2025-12-01 2026-01-01"
	"2026-01-01 2026-02-01"
	"2026-02-01 2026-03-01"
	"2026-03-01 2026-04-01"
	"2026-04-01 2026-05-01"
)

TOTAL=${#MONTHS[@]}
DONE=0
FAILED=0

for window in "${MONTHS[@]}"; do
	FROM=$(echo "$window" | cut -d' ' -f1)
	TO=$(echo "$window" | cut -d' ' -f2)

	SQL="${MV_QUERY}
  AND session_date >= parseDateTimeBestEffort('${FROM}T00:00:00.000Z')
  AND session_date < parseDateTimeBestEffort('${TO}T00:00:00.000Z')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.session_id ORDER BY cs.ingested_at DESC) = 1
SETTINGS async_insert=0"

	echo "[$(date +%H:%M:%S)] Backfilling ${FROM} → ${TO} ..."
	if chcli -q "$SQL" 2>&1; then
		DONE=$((DONE + 1))
		echo "[$(date +%H:%M:%S)]   ✓ done ($DONE/$TOTAL)"
	else
		FAILED=$((FAILED + 1))
		echo "[$(date +%H:%M:%S)]   ✗ FAILED ($FROM → $TO)"
	fi
done

echo ""
echo "Backfill complete: $DONE succeeded, $FAILED failed out of $TOTAL chunks."
