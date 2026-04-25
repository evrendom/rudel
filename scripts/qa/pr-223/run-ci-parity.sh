#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cd "$ROOT_DIR"

echo "==> PR #223 CI parity gate"

# This is the slow, near-CI command. We keep it separate from the static gate
# because it depends on Doppler-backed env and runs the full repository verify.
# Use this before merge or when a reviewer wants the exact same signal CI uses.

bun run verify
bun run lint:wrapped:hig

echo "==> CI parity gate passed"
