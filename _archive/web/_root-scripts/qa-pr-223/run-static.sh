#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cd "$ROOT_DIR"

echo "==> PR #223 static QA gate"
echo "Repository: $ROOT_DIR"

# This script is the fast, local confidence gate for the Saturday wrapped loop.
# It stays intentionally boring:
# - route/layout lint for the wrapped surface
# - the focused wrapped/get-started tests that protect the launch flow
# - repo-wide typecheck and build so integration drift is caught early

echo "==> Apple HIG wrapped lint"
bun run lint:wrapped:hig

echo "==> Focused wrapped web tests"
bun run --cwd apps/web test \
	src/features/get-started/GetStartedRouteGate.test.tsx \
	src/features/wrapped/entry.test.ts \
	src/features/wrapped/onboarding/config.test.ts \
	src/features/wrapped/team-card/share-media.test.ts

echo "==> Focused API safety tests"
bun run --cwd apps/api test \
	src/__tests__/rate-limit.test.ts \
	src/__tests__/email.test.ts \
	src/__tests__/org-deletion-security.test.ts

echo "==> Repo lint"
bun run lint

echo "==> Repo typecheck"
bun run check-types

echo "==> Repo build"
bun run build

echo "==> Static QA gate passed"
