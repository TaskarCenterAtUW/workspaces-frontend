#!/usr/bin/env bash
#
# Local mirror of the GitHub Actions CI pipeline (.github/workflows/ci.yml).
#
# Runs the same quality gates CI does — lint, typecheck, unit tests, and e2e
# tests — against your working tree. Like CI, every step runs even when an
# earlier one fails (CI uses `if: ${{ !cancelled() }}`), so you get every
# failure in a single pass. The script exits non-zero if any step failed.
#
# Usage:
#   scripts/ci.sh              # run the full pipeline
#   SKIP_INSTALL=1 scripts/ci.sh   # skip `npm ci` (reuse existing node_modules)
#
# Run from anywhere; it cd's to the repo root.

set -uo pipefail

# Resolve repo root so the script works from any directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# GitHub Actions sets CI=true in every step; mirror that so this run behaves
# like the real pipeline. Several tools key off it: playwright.config.ts
# (retries, forbidOnly, reuseExistingServer, reporter) and nuxt.config.ts
# (`sentry.telemetry: !process.env.CI`, which suppresses the Sentry telemetry
# ping). Respect an explicit override if the caller already set CI.
export CI="${CI:-true}"

# Track failures without aborting, mirroring CI's `!cancelled()` behavior.
FAILED=()

run_step() {
  local name="$1"
  shift
  echo ""
  echo "==> ${name}"
  if "$@"; then
    echo "--- ${name}: PASS"
  else
    echo "--- ${name}: FAIL"
    FAILED+=("${name}")
  fi
}

# Install dependencies. `npm ci` runs `nuxt prepare` via postinstall, which
# generates the .nuxt types + eslint typegen that lint and typecheck rely on.
# A failed install is fatal — nothing downstream can run without it.
if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  echo "==> Install dependencies (npm ci)"
  if ! npm ci; then
    echo "--- Install dependencies: FAIL (aborting)"
    exit 1
  fi
else
  echo "==> Install dependencies: SKIPPED (SKIP_INSTALL=1)"
fi

run_step "Lint" npm run lint
run_step "Type check" npm run typecheck
run_step "Unit tests" npm test

# Ensure the Playwright chromium browser is present before running e2e.
run_step "Install Playwright browser" npx playwright install --with-deps chromium
run_step "E2E tests" npm run test:e2e

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "==> All checks passed."
  exit 0
else
  echo "==> The following checks FAILED:"
  for step in "${FAILED[@]}"; do
    echo "  - ${step}"
  done
  exit 1
fi
