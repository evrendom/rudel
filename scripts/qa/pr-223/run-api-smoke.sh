#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-http://localhost:4010}"
AUTH_ORIGIN="${AUTH_ORIGIN:-http://localhost:4011}"
COOKIE_JAR="$ROOT_DIR/.context/qa-pr-223-cookies.txt"
TMP_DIR="$ROOT_DIR/.context/qa-pr-223"

mkdir -p "$TMP_DIR"

if [[ -f "$ROOT_DIR/.env" ]]; then
	# The local API testing skill already expects these values in .env.
	# Loading them here keeps the smoke script self-contained for reviewers.
	# shellcheck disable=SC1091
	source "$ROOT_DIR/.env"
fi

require_command() {
	local command_name="$1"

	if command -v "$command_name" >/dev/null 2>&1; then
		return
	fi

	echo "Missing required command: $command_name" >&2
	exit 1
}

require_env() {
	local variable_name="$1"

	if [[ -n "${!variable_name:-}" ]]; then
		return
	fi

	echo "Missing required environment variable: $variable_name" >&2
	exit 1
}

assert_equals() {
	local actual="$1"
	local expected="$2"
	local message="$3"

	if [[ "$actual" == "$expected" ]]; then
		return
	fi

	echo "Assertion failed: $message" >&2
	echo "Expected: $expected" >&2
	echo "Actual:   $actual" >&2
	exit 1
}

assert_http_status() {
	local actual_status="$1"
	local expected_status="$2"
	local body_file="$3"
	local message="$4"

	if [[ "$actual_status" == "$expected_status" ]]; then
		return
	fi

	echo "Assertion failed: $message" >&2
	echo "Expected HTTP status: $expected_status" >&2
	echo "Actual HTTP status:   $actual_status" >&2
	echo "--- response body ---" >&2
	cat "$body_file" >&2
	echo >&2
	exit 1
}

rpc_request() {
	local method_name="$1"
	local request_body="$2"
	local response_file="$3"
	local status_file="$4"

	local http_status
	http_status="$(
		curl -sS \
			-o "$response_file" \
			-w "%{http_code}" \
			-b "$COOKIE_JAR" \
			-X POST "$API_BASE_URL/rpc/$method_name" \
			-H "Content-Type: application/json" \
			-d "$request_body"
	)"

	printf "%s" "$http_status" >"$status_file"
}

sign_in() {
	echo "==> Signing in test user"

	curl -sS \
		-c "$COOKIE_JAR" \
		-X POST "$API_BASE_URL/api/auth/sign-in/email" \
		-H "Content-Type: application/json" \
		-d "{\"email\":\"$API_TESTING_USER\",\"password\":\"$API_TESTING_PASSWORD\"}" \
		>"$TMP_DIR/sign-in.json"
}

set_active_org() {
	echo "==> Setting active organization"

	curl -sS \
		-b "$COOKIE_JAR" \
		-c "$COOKIE_JAR" \
		-X POST "$API_BASE_URL/api/auth/organization/set-active" \
		-H "Content-Type: application/json" \
		-H "Origin: $AUTH_ORIGIN" \
		-d "{\"organizationId\":\"$API_TESTING_ORG\"}" \
		>"$TMP_DIR/set-active.json"
}

verify_session() {
	echo "==> Verifying authenticated session"

	rpc_request "me" "{}" "$TMP_DIR/me.json" "$TMP_DIR/me.status"
	assert_http_status \
		"$(cat "$TMP_DIR/me.status")" \
		"200" \
		"$TMP_DIR/me.json" \
		"Authenticated session should resolve /rpc/me"

	local active_org_id
	active_org_id="$(jq -r '.json.activeOrganizationId' "$TMP_DIR/me.json")"
	assert_equals \
		"$active_org_id" \
		"$API_TESTING_ORG" \
		"Active organization should match API_TESTING_ORG"
}

create_wrapped_share() {
	echo "==> Creating wrapped share snapshot"

	jq -n '
		{
			json: {
				username: "qa-smoke",
				snapshot: {
					archetypeLabel: "Smooth Operator",
					headerLeftMetric: {
						label: "Top model",
						value: "Claude Sonnet"
					},
					headerRightMetric: {
						label: "Sessions",
						value: "42"
					},
					row: {
						activeDays: 12,
						cost: 4.2,
						displayName: "QA Smoke",
						favoriteModel: "claude-sonnet-4",
						hasActivity: true,
						imageUrl: null,
						inputTokens: 1234,
						lastActiveDate: "2026-04-22",
						outputTokens: 5678,
						role: "Engineer",
						totalSessions: 42,
						totalTokens: 6912
					},
					shellClassName: "wrapped-team-card-shell",
					statItems: [
						{
							key: "sessions",
							label: "Sessions",
							value: "42"
						},
						{
							key: "tokens",
							label: "Tokens",
							value: "6,912"
						}
					],
					theme: "dark"
				}
			}
		}
	' >"$TMP_DIR/create-share.payload.json"

	rpc_request \
		"wrappedShare/create" \
		"$(cat "$TMP_DIR/create-share.payload.json")" \
		"$TMP_DIR/create-share.json" \
		"$TMP_DIR/create-share.status"

	assert_http_status \
		"$(cat "$TMP_DIR/create-share.status")" \
		"200" \
		"$TMP_DIR/create-share.json" \
		"wrappedShare/create should succeed"

	SHARE_ID="$(jq -r '.json.id' "$TMP_DIR/create-share.json")"
	SHARE_EXPIRES_AT="$(jq -r '.json.expires_at' "$TMP_DIR/create-share.json")"

	if [[ "$SHARE_ID" == "null" || -z "$SHARE_ID" ]]; then
		echo "Share creation did not return an id" >&2
		cat "$TMP_DIR/create-share.json" >&2
		exit 1
	fi

	if [[ "$SHARE_EXPIRES_AT" == "null" || -z "$SHARE_EXPIRES_AT" ]]; then
		echo "Share creation did not return expires_at" >&2
		cat "$TMP_DIR/create-share.json" >&2
		exit 1
	fi
}

get_public_wrapped_share() {
	echo "==> Fetching public wrapped share"

	local request_body
	request_body="$(jq -n --arg shareId "$SHARE_ID" '{json: {shareId: $shareId}}')"

	rpc_request \
		"wrappedShare/getPublic" \
		"$request_body" \
		"$TMP_DIR/get-share.json" \
		"$TMP_DIR/get-share.status"

	assert_http_status \
		"$(cat "$TMP_DIR/get-share.status")" \
		"200" \
		"$TMP_DIR/get-share.json" \
		"wrappedShare/getPublic should return the saved snapshot"

	assert_equals \
		"$(jq -r '.json.id' "$TMP_DIR/get-share.json")" \
		"$SHARE_ID" \
		"Public share id should match the created share"

	assert_equals \
		"$(jq -r '.json.snapshot.row.displayName' "$TMP_DIR/get-share.json")" \
		"QA Smoke" \
		"Public share should return the saved row display name"
}

create_wrapped_resume() {
	echo "==> Creating wrapped desktop resume link"

	local request_body
	request_body="$(jq -n --arg shareId "$SHARE_ID" '{json: {shareId: $shareId}}')"

	rpc_request \
		"wrappedResume/create" \
		"$request_body" \
		"$TMP_DIR/create-resume.json" \
		"$TMP_DIR/create-resume.status"

	assert_http_status \
		"$(cat "$TMP_DIR/create-resume.status")" \
		"200" \
		"$TMP_DIR/create-resume.json" \
		"wrappedResume/create should return a resume URL"

	RESUME_URL="$(jq -r '.json.resume_url' "$TMP_DIR/create-resume.json")"
	RESUME_TOKEN="${RESUME_URL##*/}"

	if [[ "$RESUME_URL" == "null" || -z "$RESUME_URL" ]]; then
		echo "Resume creation did not return resume_url" >&2
		cat "$TMP_DIR/create-resume.json" >&2
		exit 1
	fi

	if [[ "$RESUME_TOKEN" == "$RESUME_URL" || -z "$RESUME_TOKEN" ]]; then
		echo "Could not parse resume token from resume_url" >&2
		cat "$TMP_DIR/create-resume.json" >&2
		exit 1
	fi
}

consume_wrapped_resume() {
	echo "==> Consuming wrapped desktop resume link"

	local request_body
	request_body="$(jq -n --arg token "$RESUME_TOKEN" '{json: {token: $token}}')"

	rpc_request \
		"wrappedResume/consume" \
		"$request_body" \
		"$TMP_DIR/consume-resume.json" \
		"$TMP_DIR/consume-resume.status"

	assert_http_status \
		"$(cat "$TMP_DIR/consume-resume.status")" \
		"200" \
		"$TMP_DIR/consume-resume.json" \
		"wrappedResume/consume should succeed once for the same signed-in user"

	assert_equals \
		"$(jq -r '.json.redirect_to' "$TMP_DIR/consume-resume.json")" \
		"/get-started?share_id=$SHARE_ID" \
		"Resume consume should send the user back to get-started with share attribution"

	assert_equals \
		"$(jq -r '.json.share_id' "$TMP_DIR/consume-resume.json")" \
		"$SHARE_ID" \
		"Resume consume should preserve the original share id"
}

assert_resume_single_use() {
	echo "==> Verifying resume token is single-use"

	local request_body
	request_body="$(jq -n --arg token "$RESUME_TOKEN" '{json: {token: $token}}')"

	rpc_request \
		"wrappedResume/consume" \
		"$request_body" \
		"$TMP_DIR/consume-resume-again.json" \
		"$TMP_DIR/consume-resume-again.status"

	assert_http_status \
		"$(cat "$TMP_DIR/consume-resume-again.status")" \
		"409" \
		"$TMP_DIR/consume-resume-again.json" \
		"Resume token should be rejected after first use"
}

require_command curl
require_command jq
require_env API_TESTING_USER
require_env API_TESTING_PASSWORD
require_env API_TESTING_ORG

echo "==> PR #223 local API smoke"
echo "API base URL: $API_BASE_URL"
echo "Auth origin:  $AUTH_ORIGIN"

# Health is a POST RPC method in this server. Keep the smoke strict here so we
# fail on a real API issue instead of silently ignoring a method mismatch.
curl -sS \
	-o "$TMP_DIR/health.json" \
	-w "%{http_code}" \
	-X POST "$API_BASE_URL/rpc/health" \
	-H "Content-Type: application/json" \
	-d "{}" \
	>"$TMP_DIR/health.status"

assert_http_status \
	"$(cat "$TMP_DIR/health.status")" \
	"200" \
	"$TMP_DIR/health.json" \
	"Health check should succeed before wrapped API smoke starts"

sign_in
set_active_org
verify_session
create_wrapped_share
get_public_wrapped_share
create_wrapped_resume
consume_wrapped_resume
assert_resume_single_use

echo "==> API smoke passed"
echo "Share id:   $SHARE_ID"
echo "Resume URL: $RESUME_URL"
